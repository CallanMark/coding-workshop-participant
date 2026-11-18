"""
Incidents service layer: validation, workflow rules and permissions.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.
"""

from datetime import datetime, timezone

from psycopg import errors as pg_errors

import repository
from common.db import transaction
from common.errors import BadRequest, Conflict, Forbidden, NotFound, NotImplementedYet
from common.http import Request

PRIORITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "in_progress", "blocked", "resolved", "closed")

# The single source of truth for the incident workflow.
# (from, to) -> who may make the move, and whether a reason is required.
TRANSITIONS = {
    ("open", "in_progress"):     {"who": {"assignee", "admin"}, "reason": False},
    ("in_progress", "blocked"):  {"who": {"assignee", "admin"}, "reason": True},
    ("blocked", "in_progress"):  {"who": {"assignee", "admin"}, "reason": False},
    ("in_progress", "resolved"): {"who": {"assignee", "admin"}, "reason": False},
    ("resolved", "closed"):      {"who": {"reporter", "admin"}, "reason": False},
    ("resolved", "in_progress"): {"who": {"reporter", "admin"}, "reason": True},   # reopen
    ("open", "closed"):          {"who": {"reporter", "admin"}, "reason": True},   # cancel
}


def list_incidents(req: Request) -> list[dict]:
    """List incidents; ?user_id= limits to ones that user reported or is assigned to."""
    # TODO(auth): replace ?user_id= with the logged-in user (mine=true) once auth exists.
    user_id = req.query.get("user_id")
    if user_id is not None and not user_id.isdigit():
        raise BadRequest(details={"user_id": "user_id must be an integer"})
    return repository.list_incidents(int(user_id) if user_id is not None else None)


def create_incident(req: Request) -> dict:
    """Validate the body and create an incident with status 'open'."""
    data = req.body
    details = {}
    title = (data.get("title") or "").strip()
    if not title:
        details["title"] = "Title is required"
    for name in ("building_id", "reporter_id"):
        if not isinstance(data.get(name), int):
            details[name] = f"{name} is required and must be an integer"
    for name in ("category_id", "floor_id", "seat_id"):
        if data.get(name) is not None and not isinstance(data[name], int):
            details[name] = f"{name} must be an integer"
    priority = data.get("priority") or "medium"
    if priority not in PRIORITIES:
        details["priority"] = f"Priority must be one of {', '.join(PRIORITIES)}"
    if details:
        raise BadRequest(details=details)

    # TODO(auth): take reporter_id from the logged-in user instead of the body.
    fields = {
        "title": title,
        "description": data.get("description"),
        "category_id": data.get("category_id"),
        "building_id": data["building_id"],
        "floor_id": data.get("floor_id"),
        "seat_id": data.get("seat_id"),
        "reporter_id": data["reporter_id"],
        "priority": priority,
    }
    try:
        row = repository.insert_incident(fields)
    except pg_errors.ForeignKeyViolation as exc:
        column = exc.diag.constraint_name.removeprefix("incidents_").removesuffix("_fkey")
        raise BadRequest(details={column: f"{column} does not exist"}) from exc
    return repository.get_incident(row["id"])


def change_status(req: Request) -> dict:
    """Move an incident to a new status, set its timestamps, and record any reason as a note."""
    incident_id = req.params["id"]
    new_status = req.body.get("status")
    reason = (req.body.get("reason") or "").strip()
    actor_id = req.body.get("actor_id")  # TODO(auth): use the logged-in user instead of the body.

    details = {}
    if new_status not in STATUSES:
        details["status"] = f"Status must be one of {', '.join(STATUSES)}"
    if not isinstance(actor_id, int):
        details["actor_id"] = "actor_id is required and must be an integer"
    if details:
        raise BadRequest(details=details)

    with transaction():
        role = repository.get_user_role(actor_id)
        if role is None:
            raise BadRequest(details={"actor_id": "actor_id does not exist"})
        incident = repository.lock_incident(incident_id)
        if incident is None:
            raise NotFound("Incident not found")

        relations = _relations(incident, actor_id, role)
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
        if reason:
            repository.insert_note(incident_id, actor_id, f"Moved from {old_status} to {new_status}: {reason}")

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


def _relations(incident: dict, user_id: int, role: str) -> set[str]:
    """How a user relates to an incident: any of 'admin', 'reporter', 'assignee'."""
    relations = set()
    if role == "admin":
        relations.add("admin")
    if incident["reporter_id"] == user_id:
        relations.add("reporter")
    if incident["assignee_id"] == user_id:
        relations.add("assignee")
    return relations


def _status_fields(incident: dict, new_status: str, reason: str) -> dict:
    """The workflow columns after moving `incident` to `new_status` (timestamps set by the backend)."""
    now = datetime.now(timezone.utc)
    old_status = incident["status"]
    fields = {
        "status": new_status,
        "blocked_reason": reason if new_status == "blocked" else None,
        "acknowledged_at": incident["acknowledged_at"],
        "resolved_at": incident["resolved_at"],
        "closed_at": incident["closed_at"],
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
