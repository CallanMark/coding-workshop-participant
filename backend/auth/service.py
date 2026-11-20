"""
Auth service layer: registration, login, the current user, and engineer profiles.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.

Engineer profiles are the facility admin's job (admin-only routes): list, create with a temporary password,
change name, team and availability, and deactivate or reactivate. Engineers are never deleted, so incident
history keeps their names.
"""

import re

from psycopg import errors as pg_errors

import repository
from common import lookups, validate
from common.auth import DUMMY_HASH, hash_password, issue_token, verify_password
from common.errors import BadRequest, Conflict, Forbidden, NotFound, Unauthorized, counted
from common.http import Request

EMAIL_PATTERN = re.compile(r"^[a-z0-9._%+-]+@acme\.inc$")
MIN_PASSWORD, MAX_PASSWORD = 8, 128
MAX_NAME = 100
LOGIN_FAILED = "Email or password is incorrect"
ENGINEER_NOT_FOUND = "Engineer not found"


def register(req: Request) -> dict:
    """Create an employee account (self-registration is employees only) and sign them in."""
    name, email, password, details = _profile(req.body)
    if details:
        raise BadRequest(details=details)
    user_id = _create_account(name, email, password, role="employee", team_id=None, created_by=None)
    return _session(lookups.get_user(user_id))


def login(req: Request) -> dict:
    """
    Check email + password and return a token.
    Every failed sign-in (blank, unknown email, wrong password) is the same 401, so the
    response never says which part was wrong. The login form checks for blank fields itself.
    """
    email = validate.text(req.body.get("email")).lower()
    password = validate.text(req.body.get("password"), strip=False)

    creds = repository.get_credentials(email) if email else None
    # Always run one hash check so blank or unknown emails take as long as wrong passwords.
    password_ok = verify_password(password, creds["password_hash"] if creds else DUMMY_HASH)
    if creds is None or not password_ok:
        raise Unauthorized(LOGIN_FAILED)
    if not creds["is_active"]:
        raise Forbidden("This account has been deactivated. Contact a facility admin.")
    return _session(lookups.get_user(creds["id"]))


def me(req: Request) -> dict:
    """The signed-in user's current profile (re-read from the database, so deactivation applies)."""
    user = lookups.get_user(req.user["id"])
    if user is None or not user["is_active"]:
        raise Unauthorized("Your account is no longer active. Please sign in again.")
    return user


def list_engineers(req: Request) -> list[dict]:
    """Every engineer, deactivated ones too, with team, availability and open workload. ?team_id= for one team."""
    raw = (req.query.get("team_id") or "").strip()
    team_id = validate.query_id(raw)
    if raw and team_id is None:
        raise BadRequest(details={"team_id": "team_id must be a positive integer"})
    return lookups.list_engineers(team_id, include_inactive=True)


def add_engineer(req: Request) -> dict:
    """Create an engineer profile on a team, with a temporary password for them to sign in with."""
    name, email, password, details = _profile(req.body)
    team_id = _team_id(req.body.get("team_id"), details)
    if details:
        raise BadRequest(details=details)
    _require_team(team_id)
    user_id = _create_account(name, email, password, role="engineer", team_id=team_id, created_by=req.user["id"])
    return lookups.get_user(user_id)


def update_engineer(req: Request) -> dict:
    """
    Change an engineer's name, team, availability (is_available) or whether they can sign in (is_active).
    Someone still holding open incidents can't be deactivated or moved to another team.
    """
    engineer = lookups.get_engineer(req.params["id"])
    if engineer is None:
        raise NotFound(ENGINEER_NOT_FOUND)
    fields, details = _engineer_changes(req.body)
    if details:
        raise BadRequest(details=details)
    if not fields:
        raise BadRequest("Nothing to change")
    if "team_id" in fields:
        _require_team(fields["team_id"])

    deactivating = fields.get("is_active") is False and engineer["is_active"]
    moving = fields.get("team_id", engineer["team_id"]) != engineer["team_id"]
    if deactivating or moving:
        open_work = lookups.open_incidents(engineer["id"])
        if open_work:
            raise Conflict(f"Reassign their {counted(open_work, 'open incident')} first")

    repository.update_engineer(engineer["id"], fields)
    return lookups.get_user(engineer["id"])


def _profile(body: dict) -> tuple[str, str, str, dict]:
    """Name, email and password from a request body, normalised, with field errors for any that are invalid."""
    name = validate.text(body.get("name"))
    email = validate.text(body.get("email")).lower()
    password = validate.text(body.get("password"), strip=False)
    details = {}
    if error := validate.length_error(name, "Name", MAX_NAME):
        details["name"] = error
    if not EMAIL_PATTERN.match(email):
        details["email"] = "Use an @acme.inc email address"
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        details["password"] = f"Password must be {MIN_PASSWORD} to {MAX_PASSWORD} characters"
    return name, email, password, details


def _create_account(name: str, email: str, password: str, *, role: str, team_id: int | None,
                    created_by: int | None) -> int:
    """Insert a user with a hashed password; 409 if the email is taken."""
    try:
        return repository.insert_user({
            "email": email,
            "password_hash": hash_password(password),
            "name": name,
            "role": role,
            "team_id": team_id,
            "created_by": created_by,
        })
    except pg_errors.UniqueViolation as exc:
        raise Conflict("An account with this email already exists",
                       {"email": "An account with this email already exists"}) from exc


def _engineer_changes(body: dict) -> tuple[dict, dict]:
    """The columns an engineer update sets, and field errors. Only fields present in the body change."""
    fields, details = {}, {}
    if "name" in body:
        name = validate.text(body["name"])
        if error := validate.length_error(name, "Name", MAX_NAME):
            details["name"] = error
        else:
            fields["name"] = name
    for flag in ("is_available", "is_active"):
        if flag in body:
            if isinstance(body[flag], bool):
                fields[flag] = body[flag]
            else:
                details[flag] = "Must be true or false"
    if "team_id" in body:
        team_id = _team_id(body["team_id"], details)
        if team_id is not None:
            fields["team_id"] = team_id
    return fields, details


def _team_id(value, details: dict) -> int | None:
    """A team id from the body as a positive int; adds a field error and returns None otherwise."""
    if validate.is_id(value):
        return value
    details["team_id"] = "Choose a team"
    return None


def _require_team(team_id: int) -> None:
    """400 when the team doesn't exist."""
    if lookups.get_team(team_id) is None:
        raise BadRequest(details={"team_id": "Team does not exist"})


def _session(user: dict) -> dict:
    """The login/register response: a signed token plus the public user."""
    return {"token": issue_token(user), "user": user}
