"""
Facilities service layer: validation and rules for buildings, floors, seats and categories.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.
"""

from psycopg import errors as pg_errors

import repository
from common import validate
from common.db import transaction
from common.domain import CATEGORY_TYPES
from common.errors import BadRequest, Conflict, NotFound, counted
from common.http import Request

MAX_NAME = 100

# Unique constraint -> (field, message template); {value} is the clashing value.
DUPLICATES = {
    "buildings_name_key": ("name", "A building called {value} already exists"),
    "floors_building_id_name_key": ("name", "This building already has a floor called {value}"),
    "seats_floor_id_code_key": ("code", "This floor already has a seat {value}"),
    "categories_name_key": ("name", "A category called {value} already exists"),
}

# Per table: singular label, and what must be removed first ("children") before it can be deleted.
LABELS = {"buildings": "building", "floors": "floor", "seats": "seat", "categories": "category"}


# --- buildings ---------------------------------------------------------------------

def list_buildings(req: Request) -> list[dict]:
    """Every building, by name, with floor and incident counts."""
    return repository.list_buildings()


def create_building(req: Request) -> dict:
    """Add a building (admin)."""
    return _write("buildings", None, {"name": _required_text(req.body, "name")})


def update_building(req: Request) -> dict:
    """Rename a building (admin)."""
    return _write("buildings", req.params["id"], {"name": _required_text(req.body, "name")})


def delete_building(req: Request) -> None:
    """Delete a building with no floors and no incidents (admin)."""
    _delete("buildings", req.params["id"])


# --- floors -----------------------------------------------------------------------

def list_floors(req: Request) -> list[dict]:
    """A building's floors, in the order they were added; 404 if the building does not exist."""
    _require("buildings", req.params["id"])
    return repository.list_floors(req.params["id"])


def create_floor(req: Request) -> dict:
    """Add a floor to a building (admin)."""
    name = _required_text(req.body, "name")
    _require("buildings", req.params["id"])
    return _write("floors", None, {"building_id": req.params["id"], "name": name})


def update_floor(req: Request) -> dict:
    """Rename a floor (admin). A floor can't move to another building: incidents record both."""
    return _write("floors", req.params["id"], {"name": _required_text(req.body, "name")})


def delete_floor(req: Request) -> None:
    """Delete a floor with no seats and no incidents (admin)."""
    _delete("floors", req.params["id"])


# --- seats ------------------------------------------------------------------------

def list_seats(req: Request) -> list[dict]:
    """A floor's seats, by code; 404 if the floor does not exist."""
    _require("floors", req.params["id"])
    return repository.list_seats(req.params["id"])


def create_seat(req: Request) -> dict:
    """Add a seat to a floor (admin)."""
    code = _required_text(req.body, "code")
    _require("floors", req.params["id"])
    return _write("seats", None, {"floor_id": req.params["id"], "code": code})


def update_seat(req: Request) -> dict:
    """Change a seat's code (admin)."""
    return _write("seats", req.params["id"], {"code": _required_text(req.body, "code")})


def delete_seat(req: Request) -> None:
    """Delete a seat no incident mentions (admin)."""
    _delete("seats", req.params["id"])


# --- categories ---------------------------------------------------------------------

def list_categories(req: Request) -> list[dict]:
    """Every category with the team its incidents go to."""
    return repository.list_categories()


def create_category(req: Request) -> dict:
    """Add a category: name, type (facility or technology) and the team that handles it (admin)."""
    return _write("categories", None, _category_fields(req.body))


def update_category(req: Request) -> dict:
    """
    Change a category (admin). A new team applies to incidents reported from now on;
    existing incidents stay with the team they were routed to.
    """
    return _write("categories", req.params["id"], _category_fields(req.body))


def delete_category(req: Request) -> None:
    """Delete a category no incident uses (admin)."""
    _delete("categories", req.params["id"])


def list_teams(req: Request) -> list[dict]:
    """Every team, for choosing which team handles a category."""
    return repository.list_teams()


# --- helpers ------------------------------------------------------------------------

def _required_text(data: dict, field: str) -> str:
    """A trimmed, non-blank string field of at most MAX_NAME characters (400 otherwise)."""
    value = validate.text(data.get(field))
    if error := validate.length_error(value, field.capitalize(), MAX_NAME):
        raise BadRequest(details={field: error})
    return value


def _category_fields(data: dict) -> dict:
    """Validated name, type and team_id for a category (400 naming each bad field)."""
    details = {}
    try:
        name = _required_text(data, "name")
    except BadRequest as err:
        details.update(err.details)
        name = None
    if data.get("type") not in CATEGORY_TYPES:
        details["type"] = f"Type must be one of {', '.join(CATEGORY_TYPES)}"
    team_id = data.get("team_id")
    if not validate.is_id(team_id):
        details["team_id"] = "Choose the team that handles this category"
    if details:
        raise BadRequest(details=details)
    return {"name": name, "type": data["type"], "team_id": team_id}


def _require(table: str, row_id: int) -> dict:
    """The row, or 404 naming what is missing."""
    row = repository.get(table, row_id)
    if row is None:
        raise NotFound(f"{LABELS[table].capitalize()} not found")
    return row


def _write(table: str, row_id: int | None, fields: dict) -> dict:
    """Insert (row_id None) or update a row; a duplicate is 409 and an unknown team is 400."""
    try:
        with transaction():
            row = repository.insert(table, fields) if row_id is None else repository.update(table, row_id, fields)
    except pg_errors.UniqueViolation as exc:
        field, message = DUPLICATES.get(exc.diag.constraint_name, ("name", "That name is already taken"))
        raise Conflict(message.format(value=fields.get(field)), details={field: "Already in use"}) from exc
    except pg_errors.ForeignKeyViolation as exc:
        raise BadRequest(details={"team_id": "Team does not exist"}) from exc
    if row is None:
        raise NotFound(f"{LABELS[table].capitalize()} not found")
    return row


def _delete(table: str, row_id: int) -> None:
    """Delete a row unless something still uses it (409 saying what), or 404."""
    with transaction():
        _require(table, row_id)
        in_use = {label: count for label, count in repository.usage(table, row_id).items() if count}
        if in_use.get("incidents"):
            count = in_use["incidents"]
            raise Conflict(f"Used by {counted(count, 'incident')}, so it can't be deleted")
        if in_use:  # floors or seats under it
            label, count = next(iter(in_use.items()))
            raise Conflict(f"Delete its {counted(count, label[:-1])} first")  # label is plural: "floors"
        try:
            repository.delete(table, row_id)
        except pg_errors.ForeignKeyViolation as exc:  # something was added since the check
            raise Conflict(f"This {LABELS[table]} is in use, so it can't be deleted") from exc
