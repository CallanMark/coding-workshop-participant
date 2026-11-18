"""
Incidents service layer: validation, workflow rules and permissions.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.
"""

from datetime import UTC, datetime

from psycopg import errors as pg_errors

import repository
from common.db import transaction
from common.errors import BadRequest, Conflict, Forbidden, NotFound, NotImplementedYet
from common.http import Request

PRIORITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "in_progress", "blocked", "resolved", "closed")

# The single source of truth for the incident workflow.
# (from, to) -> who may make the move, and whether a reason is required.
# "manager" means the manager of the incident's team; they act as admin within their team.
TRANSITIONS = {
    ("open", "in_progress"):     {"who": {"assignee", "manager", "admin"}, "reason": False},
    ("in_progress", "blocked"):  {"who": {"assignee", "manager", "admin"}, "reason": True},
    ("blocked", "in_progress"):  {"who": {"assignee", "manager", "admin"}, "reason": False},
    ("in_progress", "resolved"): {"who": {"assignee", "manager", "admin"}, "reason": False},
    ("resolved", "closed"):      {"who": {"reporter", "manager", "admin"}, "reason": False},
    ("resolved", "in_progress"): {"who": {"reporter", "manager", "admin"}, "reason": True},   # reopen
    ("open", "closed"):          {"who": {"reporter", "manager", "admin"}, "reason": True},   # cancel
}

# Database constraint name -> (field, message), so constraint violations become field-level 400s.
CONSTRAINT_ERRORS = {
    "incidents_building_id_fkey":  ("building_id", "Building does not exist"),
    "incidents_floor_in_building": ("floor_id", "Floor does not exist in that building"),
    "incidents_seat_on_floor":     ("seat_id", "Seat does not exist on that floor"),
    "incidents_seat_needs_floor":  ("seat_id", "Choose a floor before choosing a seat"),
}


def list_incidents(req: Request) -> list[dict]:
    """Incidents the signed-in user may see, newest first. ?mine=true: only ones they reported or are assigned."""
    mine = req.query.get("mine", "false")
    if mine not in ("true", "false"):
        raise BadRequest(details={"mine": "mine must be true or false"})
    return repository.list_incidents(visible_to(req.user), req.user["id"] if mine == "true" else None)


def visible_to(user: dict) -> dict | None:
    """
    Which incidents a user may see, as column -> value conditions (any one matching is enough);
    None means all. Mirrors _relations(): a user sees an incident when they have any relation to it.
    """
    if user["role"] == "admin":
        return None
    visible = {"reporter_id": user["id"], "assignee_id": user["id"]}
    if user["role"] in ("engineer", "manager") and user["team_id"] is not None:
        visible["team_id"] = user["team_id"]  # the whole team's queue, assigned or not
    return visible


def create_incident(req: Request) -> dict:
    """Validate the body and create an incident with status 'open'."""
    data = req.body
    details = {}
    title = _text(data.get("title"))
    description = _text(data.get("description")) or None
    if not title:
        details["title"] = "Title is required"
    for name in ("category_id", "building_id"):
        if not _is_id(data.get(name)):
            details[name] = f"{name} is required and must be an integer"
    for name in ("floor_id", "seat_id"):
        if data.get(name) is not None and not _is_id(data[name]):
            details[name] = f"{name} must be an integer"
    priority = data.get("priority") or "medium"
    if priority not in PRIORITIES:
        details["priority"] = f"Priority must be one of {', '.join(PRIORITIES)}"
    if details:
        raise BadRequest(details=details)

    fields = {
        "title": title,
        "description": description,
        "category_id": data["category_id"],
        "building_id": data["building_id"],
        "floor_id": data.get("floor_id"),
        "seat_id": data.get("seat_id"),
        "reporter_id": req.user["id"],  # always the signed-in user; any reporter_id in the body is ignored
        "priority": priority,
    }
    try:
        with transaction():
            # The category routes the incident to its owning team.
            fields["team_id"] = repository.get_category_team(fields["category_id"])
            if fields["team_id"] is None:
                raise BadRequest(details={"category_id": "Category does not exist"})
            row = repository.insert_incident(fields)
            repository.insert_event(row["id"], fields["reporter_id"], "created", to_value="open")
    except (pg_errors.ForeignKeyViolation, pg_errors.CheckViolation) as exc:
        field_error = CONSTRAINT_ERRORS.get(exc.diag.constraint_name)
        if field_error is None:
            raise
        raise BadRequest(details=dict([field_error])) from exc
    return repository.get_incident(row["id"])


def change_status(req: Request) -> dict:
    """Move an incident to a new status, set its timestamps, and record it in the audit trail."""
    incident_id = req.params["id"]
    new_status = req.body.get("status")
    reason = req.body.get("reason")
    reason = reason.strip() if isinstance(reason, str) else ""
    actor_id = req.user["id"]

    if new_status not in STATUSES:
        raise BadRequest(details={"status": f"Status must be one of {', '.join(STATUSES)}"})

    with transaction():
        incident = repository.lock_incident(incident_id)
        if incident is None:
            raise NotFound("Incident not found")

        relations = _relations(incident, req.user)
        if not relations:
            raise NotFound("Incident not found")  # out of scope: don't reveal it exists

        old_status = incident["status"]
        rule = TRANSITIONS.get((old_status, new_status))
        if rule is None:
            raise Conflict(f"Cannot move an incident from {old_status} to {new_status}")
        if not relations & rule["who"]:
            allowed = " or ".join(sorted(rule["who"]))
            raise Forbidden(f"Only the {allowed} can move an incident from {old_status} to {new_status}")
        if old_status == "open" and new_status == "in_progress" and incident["assignee_id"] is None:
            raise Conflict("Assign an engineer before starting work")
        if rule["reason"] and not reason:
            raise BadRequest(details={"reason": "A reason is required for this change"})

        repository.update_status(incident_id, _status_fields(incident, new_status, reason))
        repository.insert_event(incident_id, actor_id, "status_changed", old_status, new_status, reason or None)

    return repository.get_incident(incident_id)


def update_incident(req: Request) -> dict:
    """Update an incident's details (title, description, category, location, priority)."""
    # TODO: validate fields like create_incident, check reporter/admin scope, UPDATE ... RETURNING (0 rows → 404).
    raise NotImplementedYet(f"Updating incident {req.params['id']} is not implemented yet")


def escalate_incident(req: Request) -> dict:
    """Request (or clear) escalation of an incident, with a required reason."""
    # TODO: require reason, set is_escalated + escalation_reason, add a note in the same transaction.
    raise NotImplementedYet(f"Escalating incident {req.params['id']} is not implemented yet")


def delete_incident(req: Request) -> None:
    """Delete an incident (its notes cascade)."""
    # TODO: admin check (403), DELETE ... RETURNING id (0 rows → 404); route responds 204.
    raise NotImplementedYet(f"Deleting incident {req.params['id']} is not implemented yet")


def _relations(incident: dict, user: dict) -> set[str]:
    """
    How the signed-in user relates to an incident: any of 'admin', 'manager' (manager of its team),
    'team' (engineer or manager on its team), 'reporter', 'assignee'. Empty means out of scope (404).
    """
    relations = set()
    if user["role"] == "admin":
        relations.add("admin")
    same_team = user["team_id"] is not None and incident["team_id"] == user["team_id"]
    if same_team and user["role"] in ("engineer", "manager"):
        relations.add("team")
        if user["role"] == "manager":
            relations.add("manager")
    if incident["reporter_id"] == user["id"]:
        relations.add("reporter")
    if incident["assignee_id"] == user["id"]:
        relations.add("assignee")
    return relations


def _text(value) -> str:
    """A trimmed JSON string field; anything else (number, list, null, missing) counts as blank."""
    return value.strip() if isinstance(value, str) else ""


def _is_id(value) -> bool:
    """A positive integer id. (bool is excluded: in Python True is an int.)"""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _status_fields(incident: dict, new_status: str, reason: str) -> dict:
    """The workflow columns after moving `incident` to `new_status` (timestamps set by the backend)."""
    now = datetime.now(UTC)
    old_status = incident["status"]
    fields = {
        "status": new_status,
        "blocked_reason": reason if new_status == "blocked" else None,
        "acknowledged_at": incident["acknowledged_at"],
        "resolved_at": incident["resolved_at"],
        "closed_at": incident["closed_at"],
        "updated_at": now,
    }
    if old_status == "open" and new_status == "in_progress" and fields["acknowledged_at"] is None:
        fields["acknowledged_at"] = now
    if new_status == "resolved":
        fields["resolved_at"] = now
    if old_status == "resolved" and new_status == "in_progress":
        fields["resolved_at"] = None  # reopened
    if new_status == "closed":
        fields["closed_at"] = now
    return fields
