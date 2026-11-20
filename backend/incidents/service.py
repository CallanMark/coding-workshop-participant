"""
Incidents service layer: validation, workflow rules and permissions.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.
"""

from datetime import UTC, datetime

from psycopg import errors as pg_errors

import repository
from common import lookups, validate
from common.auth import manages
from common.db import transaction
from common.domain import ACTIVE_STATUSES, PRIORITIES, STATUSES
from common.errors import BadRequest, Conflict, Forbidden, NotFound
from common.http import Request

MAX_TITLE = 200
MAX_QUERY = 100
MAX_DUPLICATES = 5
MAX_COMMENT = 1000
MAX_NOTE = 2000
FEEDBACK_STATUSES = ("resolved", "closed")  # feedback is about completed work

# The single source of truth for the incident workflow.
# (from, to) -> who may make the move, and whether a reason is required.
# Status is the handling team's job: the assigned engineer, the manager of the incident's team (who acts as
# admin within their team) or an admin. Reporters follow progress and add notes; they never move status.
WORKERS = frozenset({"assignee", "manager", "admin"})
TRANSITIONS = {
    ("open", "in_progress"):     {"who": WORKERS, "reason": False},
    ("in_progress", "blocked"):  {"who": WORKERS, "reason": True},
    ("blocked", "in_progress"):  {"who": WORKERS, "reason": False},
    ("in_progress", "resolved"): {"who": WORKERS, "reason": False},
    ("resolved", "closed"):      {"who": WORKERS, "reason": False},
    ("resolved", "in_progress"): {"who": WORKERS, "reason": True},   # reopen
    ("open", "closed"):          {"who": WORKERS, "reason": True},   # cancel, e.g. a duplicate
}

# Database constraint name -> (field, message), so constraint violations become field-level 400s.
CONSTRAINT_ERRORS = {
    "incidents_building_id_fkey":  ("building_id", "Building does not exist"),
    "incidents_floor_in_building": ("floor_id", "Floor does not exist in that building"),
    "incidents_seat_on_floor":     ("seat_id", "Seat does not exist on that floor"),
    "incidents_seat_needs_floor":  ("seat_id", "Choose a floor before choosing a seat"),
}


def list_incidents(req: Request) -> list[dict]:
    """
    Incidents the signed-in user may see, newest first. ?mine=true: only ones they reported or are assigned.
    Filters: status, priority, category_id, building_id, assignee_id (or "none"), escalated, q (text search).
    """
    mine = req.query.get("mine", "false")
    details = {}
    if mine not in ("true", "false"):
        details["mine"] = "mine must be true or false"
    filters, filter_errors = _list_filters(req.query)
    details.update(filter_errors)
    if details:
        raise BadRequest(details=details)
    return repository.list_incidents(visible_to(req.user), req.user["id"] if mine == "true" else None, filters)


def get_incident(req: Request) -> dict:
    """One incident the signed-in user may see (404 otherwise)."""
    incident = repository.get_incident(req.params["id"])
    _visible_relations(incident, req.user)
    return incident


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


def find_duplicates(req: Request) -> list[dict]:
    """
    Possible duplicates of an incident being reported: active incidents with the same category, building
    and floor. Any signed-in user, so reporters can spot an existing ticket. Only each one's title, category
    and place come back, never a way to open it: the reporter may not be allowed to see it.
    """
    return repository.find_duplicates(**_duplicate_location(req.query), limit=MAX_DUPLICATES)


def create_incident(req: Request) -> dict:
    """Validate the body and create an incident with status 'open'."""
    fields = _incident_fields(req.body, partial=False)
    fields["reporter_id"] = req.user["id"]  # always the signed-in user; any reporter_id in the body is ignored
    try:
        with transaction():
            # The category routes the incident to its owning team.
            fields["team_id"] = repository.get_category_team(fields["category_id"])
            if fields["team_id"] is None:
                raise BadRequest(details={"category_id": "Category does not exist"})
            row = repository.insert_incident(fields)
            repository.insert_event(row["id"], fields["reporter_id"], "created", to_value="open")
    except (pg_errors.ForeignKeyViolation, pg_errors.CheckViolation) as exc:
        raise _field_error(exc) from exc
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
        relations = _visible_relations(incident, req.user)
        old_status = incident["status"]
        rule = TRANSITIONS.get((old_status, new_status))
        if rule is None:
            raise Conflict(f"Cannot move an incident from {old_status} to {new_status}")
        if not relations & rule["who"]:
            raise Forbidden(
                "Only the assigned engineer, the team's manager or an admin can change this incident's status"
            )
        if old_status == "open" and new_status == "in_progress" and incident["assignee_id"] is None:
            raise Conflict("Assign an engineer before starting work")
        if rule["reason"] and not reason:
            raise BadRequest(details={"reason": "A reason is required for this change"})

        repository.update_status(incident_id, _status_fields(incident, new_status, reason))
        repository.insert_event(incident_id, actor_id, "status_changed", old_status, new_status, reason or None)

    return repository.get_incident(incident_id)


def update_incident(req: Request) -> dict:
    """
    Edit an incident's details; only the fields sent are changed. Reporter while open, team manager or admin.
    A category owned by another team moves the incident to that team (open incidents only) and unassigns it.
    """
    incident_id = req.params["id"]
    changes = _incident_fields(req.body, partial=True)
    if not changes:
        raise BadRequest("Send at least one field to change")
    actor_id = req.user["id"]

    try:
        with transaction():
            incident = repository.lock_incident(incident_id)
            relations = _visible_relations(incident, req.user)
            if not relations & {"manager", "admin"} and not ("reporter" in relations and incident["status"] == "open"):
                raise Forbidden("Only the reporter (while open), the team's manager or an admin can edit an incident")
            if incident["status"] == "closed":
                raise Conflict("A closed incident cannot be edited")

            if "category_id" in changes:
                team_id = repository.get_category_team(changes["category_id"])
                if team_id is None:
                    raise BadRequest(details={"category_id": "Category does not exist"})
                if team_id != incident["team_id"]:
                    if incident["status"] != "open":
                        raise Conflict("Only an open incident can move to a category owned by another team")
                    changes.update(team_id=team_id, assignee_id=None, assigned_at=None)

            changes = {name: value for name, value in changes.items() if incident[name] != value}
            if not changes:
                return repository.get_incident(incident_id)
            repository.update_incident(incident_id, {**changes, "updated_at": datetime.now(UTC)})

            if "priority" in changes:
                repository.insert_event(incident_id, actor_id, "priority_changed",
                                        incident["priority"], changes["priority"])
            if "team_id" in changes:
                repository.insert_event(incident_id, actor_id, "team_changed",
                                        str(incident["team_id"]), str(changes["team_id"]))
                if incident["assignee_id"] is not None:
                    repository.insert_event(incident_id, actor_id, "assigned", str(incident["assignee_id"]), None,
                                            "Moved to another team")
    except (pg_errors.ForeignKeyViolation, pg_errors.CheckViolation) as exc:
        raise _field_error(exc) from exc
    return repository.get_incident(incident_id)


def assign_incident(req: Request) -> dict:
    """
    Assign an incident to an engineer, or unassign it (assignee_id null; open incidents only).
    Team manager or admin: any active, available engineer on the incident's team.
    Engineer: only themselves, only to an unassigned incident of their own team; it also counts as acknowledging it.
    """
    incident_id = req.params["id"]
    assignee_id = req.body.get("assignee_id")
    if assignee_id is not None and not validate.is_id(assignee_id):
        raise BadRequest(details={"assignee_id": "assignee_id must be an engineer's id, or null to unassign"})

    with transaction():
        incident = repository.lock_incident(incident_id)
        relations = _visible_relations(incident, req.user)
        leads = bool(relations & {"manager", "admin"})
        self_assign = "team" in relations and req.user["role"] == "engineer" and assignee_id == req.user["id"]
        if not leads and not self_assign:
            raise Forbidden("Only the team's manager or an admin can assign; an engineer can only take a ticket")
        if incident["status"] not in ACTIVE_STATUSES:
            raise Conflict(f"A {incident['status']} incident cannot be reassigned")
        if not leads and incident["assignee_id"] is not None:
            raise Conflict("This incident is already assigned")
        if assignee_id == incident["assignee_id"]:
            return repository.get_incident(incident_id)
        if assignee_id is None and incident["status"] != "open":
            raise Conflict("Work has started: assign another engineer instead of unassigning")

        if assignee_id is not None:
            _check_assignee(lookups.get_user(assignee_id), incident["team_id"])
        now = datetime.now(UTC)
        changes = {"assignee_id": assignee_id, "assigned_at": now if assignee_id else None, "updated_at": now}
        if self_assign and incident["acknowledged_at"] is None:
            changes["acknowledged_at"] = now
        repository.update_incident(incident_id, changes)
        repository.insert_event(incident_id, req.user["id"], "assigned", _id_text(incident["assignee_id"]),
                                _id_text(assignee_id))
    return repository.get_incident(incident_id)


def escalate_incident(req: Request) -> dict:
    """
    Escalate an active incident ({"escalate": true, "reason"}: reporter, assignee, team manager or admin),
    or clear the escalation ({"escalate": false}: team manager or admin).
    """
    incident_id = req.params["id"]
    escalate = req.body.get("escalate")
    reason = validate.text(req.body.get("reason"))
    details = {}
    if not isinstance(escalate, bool):
        details["escalate"] = "escalate must be true or false"
    if escalate is True and not reason:
        details["reason"] = "Say why this needs escalating"
    elif error := validate.length_error(reason, "Reason", MAX_COMMENT, required=False):
        details["reason"] = error
    if details:
        raise BadRequest(details=details)

    with transaction():
        incident = repository.lock_incident(incident_id)
        relations = _visible_relations(incident, req.user)
        allowed = {"reporter", "assignee", "manager", "admin"} if escalate else {"manager", "admin"}
        if not relations & allowed:
            who = "reporter, assignee, team manager or an admin" if escalate else "team manager or an admin"
            raise Forbidden(f"Only the {who} can {'escalate' if escalate else 'clear an escalation'}")
        if escalate and incident["status"] not in ACTIVE_STATUSES:
            raise Conflict(f"A {incident['status']} incident cannot be escalated")
        if incident["is_escalated"] == escalate:
            raise Conflict("This incident is already escalated" if escalate else "This incident is not escalated")

        repository.update_incident(incident_id, {
            "is_escalated": escalate,
            "escalation_reason": reason if escalate else None,
            "updated_at": datetime.now(UTC),
        })
        repository.insert_event(incident_id, req.user["id"], "escalated", str(not escalate).lower(),
                                str(escalate).lower(), reason or None)
    return repository.get_incident(incident_id)


def delete_incident(req: Request) -> None:
    """Delete an incident; its notes and events cascade. Admin only (checked on the route)."""
    if not repository.delete_incident(req.params["id"]):
        raise NotFound("Incident not found")


def _visible_relations(incident: dict | None, user: dict) -> set[str]:
    """The user's relations to an incident; 404 if it does not exist or is out of their scope."""
    relations = _relations(incident, user) if incident else set()
    if not relations:
        raise NotFound("Incident not found")  # out of scope: don't reveal that it exists
    return relations


def list_notes(req: Request) -> list[dict]:
    """An incident's notes, oldest first: anyone who can see the incident."""
    _visible_relations(repository.get_incident(req.params["id"]), req.user)
    return repository.list_notes(req.params["id"])


def add_note(req: Request) -> dict:
    """
    Add a note: anyone who can see the incident, until it is closed. The first note from the assignee or the
    team acknowledges the incident (the reporter is told someone is on it).
    """
    incident_id = req.params["id"]
    body = _note_body(req.body)
    with transaction():
        incident = repository.lock_incident(incident_id)
        relations = _visible_relations(incident, req.user)
        if incident["status"] == "closed":
            raise Conflict("Notes cannot be added to a closed incident")
        note_id = repository.insert_note(incident_id, req.user["id"], body)
        now = datetime.now(UTC)
        changes = {"updated_at": now}
        if relations & {"assignee", "team"} and incident["acknowledged_at"] is None:
            changes["acknowledged_at"] = now
        repository.update_incident(incident_id, changes)
    return repository.get_note(incident_id, note_id)


def edit_note(req: Request) -> dict:
    """Change a note's text: its author only, until the incident is closed."""
    incident_id, note_id = req.params["id"], req.params["note_id"]
    body = _note_body(req.body)
    with transaction():
        incident = repository.lock_incident(incident_id)
        _visible_relations(incident, req.user)
        note = repository.get_note(incident_id, note_id)
        if note is None:
            raise NotFound("Note not found")
        if note["author_id"] != req.user["id"]:
            raise Forbidden("Only the author can edit a note")
        if incident["status"] == "closed":
            raise Conflict("Notes on a closed incident cannot be changed")
        repository.update_note(note_id, body)
    return repository.get_note(incident_id, note_id)


def delete_note(req: Request) -> None:
    """Delete a note: its author (until the incident is closed) or an admin."""
    incident_id, note_id = req.params["id"], req.params["note_id"]
    with transaction():
        incident = repository.lock_incident(incident_id)
        relations = _visible_relations(incident, req.user)
        note = repository.get_note(incident_id, note_id)
        if note is None:
            raise NotFound("Note not found")
        if "admin" not in relations:
            if note["author_id"] != req.user["id"]:
                raise Forbidden("Only the author or an admin can delete a note")
            if incident["status"] == "closed":
                raise Conflict("Notes on a closed incident cannot be changed")
        repository.delete_note(note_id)


def list_events(req: Request) -> list[dict]:
    """An incident's audit trail, oldest first: anyone who can see the incident. (Feedback is never in it.)"""
    _visible_relations(repository.get_incident(req.params["id"]), req.user)
    return repository.list_events(req.params["id"])


def save_feedback(req: Request) -> dict:
    """
    The reporter's private feedback on the engineer who completed the incident: rating 1-5 and an optional
    comment. Once resolved or closed; one per incident, editable until the incident is closed.
    Never shown to the engineer, and no incident event is written (the engineer can see events).
    """
    incident_id = req.params["id"]
    rating = req.body.get("rating")
    comment = validate.text(req.body.get("comment")) or None
    details = {}
    if not (isinstance(rating, int) and not isinstance(rating, bool) and 1 <= rating <= 5):
        details["rating"] = "Rating must be a whole number from 1 to 5"
    if comment and (error := validate.length_error(comment, "Comment", MAX_COMMENT)):
        details["comment"] = error
    if details:
        raise BadRequest(details=details)

    with transaction():
        incident = repository.lock_incident(incident_id)
        relations = _visible_relations(incident, req.user)
        if "reporter" not in relations:
            raise Forbidden("Only the person who reported the incident can give feedback")
        if incident["status"] not in FEEDBACK_STATUSES:
            raise Conflict("Feedback can be given once the incident is resolved")
        if incident["assignee_id"] is None:
            raise Conflict("No engineer worked on this incident")
        if incident["assignee_id"] == req.user["id"]:
            raise Conflict("You cannot give feedback on your own work")
        if incident["status"] == "closed" and repository.get_feedback(incident_id) is not None:
            raise Conflict("Feedback cannot be changed once the incident is closed")
        repository.save_feedback(incident_id, req.user["id"], incident["assignee_id"], rating, comment)
    return repository.get_feedback(incident_id)


def get_feedback(req: Request) -> dict | None:
    """
    An incident's feedback (null if none yet), for the reporter, the engineer's manager or an admin.
    Anyone else who can see the incident, including the engineer, gets 403.
    """
    incident = repository.get_incident(req.params["id"])
    relations = _visible_relations(incident, req.user)
    feedback = repository.get_feedback(req.params["id"])
    # Before any feedback exists the engineer's manager is the manager of the incident's team.
    engineer_team = feedback["engineer_team_id"] if feedback else incident["team_id"]
    if not (relations & {"reporter", "admin"} or manages(req.user, engineer_team)):
        raise Forbidden("Only the reporter, the engineer's manager or an admin can see feedback")
    return feedback


def list_engineers(req: Request) -> list[dict]:
    """
    Active engineers with availability and workload, for the assign dropdown.
    Managers see their own team (another ?team_id= is 404); admins see everyone, or one team with ?team_id=.
    """
    raw = (req.query.get("team_id") or "").strip()
    team_id = validate.query_id(raw)
    if raw and team_id is None:
        raise BadRequest(details={"team_id": "team_id must be a positive integer"})
    if req.user["role"] == "manager":
        if team_id not in (None, req.user["team_id"]):
            raise NotFound("Team not found")
        team_id = req.user["team_id"]
    return lookups.list_engineers(team_id)


def engineer_feedback(req: Request) -> dict:
    """
    All feedback on one engineer's work with their average rating: for their team's manager or an admin
    (route allows only those roles). An engineer outside the manager's team is 404.
    """
    engineer = lookups.get_engineer(req.params["id"])
    if engineer is None or (req.user["role"] == "manager" and not manages(req.user, engineer["team_id"])):
        raise NotFound("Engineer not found")
    summary = lookups.feedback_summary(engineer["id"])
    return {
        "engineer": {key: engineer[key] for key in ("id", "name", "team_id", "team_name")},
        "count": summary["ratings"],
        "average_rating": summary["average"],
        "feedback": lookups.engineer_feedback(engineer["id"]),
    }


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


def _incident_fields(data: dict, partial: bool) -> dict:
    """
    Validated incident fields from a request body (400 naming each bad field).
    partial=False (create): title, category_id and building_id are required; priority defaults to medium.
    partial=True (edit): only the fields present are returned. Moving building or floor clears the
    lower location levels unless they are sent too, so a stale floor or seat never stays behind.
    """
    fields, details = {}, {}

    def wanted(name: str) -> bool:
        return not partial or name in data

    if wanted("title"):
        fields["title"] = validate.text(data.get("title"))
        if error := validate.length_error(fields["title"], "Title", MAX_TITLE):
            details["title"] = error
    if wanted("description"):
        fields["description"] = validate.text(data.get("description")) or None
    if wanted("priority"):
        fields["priority"] = data.get("priority") or (None if partial else "medium")
        if fields["priority"] not in PRIORITIES:
            details["priority"] = f"Priority must be one of {', '.join(PRIORITIES)}"
    for name in ("category_id", "building_id"):
        if wanted(name):
            fields[name] = data.get(name)
            if not validate.is_id(fields[name]):
                details[name] = f"{name} is required and must be an integer"
    cleared = {"floor_id": "building_id" in data, "seat_id": "building_id" in data or "floor_id" in data}
    for name in ("floor_id", "seat_id"):
        if wanted(name) or cleared[name]:
            fields[name] = data.get(name)
            if fields[name] is not None and not validate.is_id(fields[name]):
                details[name] = f"{name} must be an integer"
    if details:
        raise BadRequest(details=details)
    return fields


def _list_filters(query: dict) -> tuple[dict, dict]:
    """List filters from the query string as repository column -> value, plus any field errors. Blank = unset."""
    filters, details = {}, {}
    value = {name: (query.get(name) or "").strip() for name in
             ("status", "priority", "category_id", "building_id", "assignee_id", "escalated", "q")}
    for name, allowed in (("status", STATUSES), ("priority", PRIORITIES)):
        if value[name] and value[name] not in allowed:
            details[name] = f"{name} must be one of {', '.join(allowed)}"
        elif value[name]:
            filters[name] = value[name]
    for name in ("category_id", "building_id", "assignee_id"):
        if not value[name]:
            continue
        if name == "assignee_id" and value[name] == "none":
            filters[name] = None  # unassigned
        elif validate.query_id(value[name]):
            filters[name] = validate.query_id(value[name])
        else:
            details[name] = f"{name} must be a positive integer" + (' or "none"' if name == "assignee_id" else "")
    if value["escalated"] and value["escalated"] not in ("true", "false"):
        details["escalated"] = "escalated must be true or false"
    elif value["escalated"]:
        filters["is_escalated"] = value["escalated"] == "true"
    if len(value["q"]) > MAX_QUERY:
        details["q"] = f"Search text must be at most {MAX_QUERY} characters"
    elif value["q"]:
        filters["q"] = value["q"]
    return filters, details


def _duplicate_location(query: dict) -> dict:
    """category_id and building_id (required) and floor_id (optional) from the query string; 400 naming each bad one."""
    location, details = {}, {}
    for name in ("category_id", "building_id", "floor_id"):
        value = (query.get(name) or "").strip()
        if not value and name == "floor_id":
            location[name] = None
        elif validate.query_id(value):
            location[name] = validate.query_id(value)
        else:
            rule = "must be" if name == "floor_id" else "is required and must be"
            details[name] = f"{name} {rule} a positive integer"
    if details:
        raise BadRequest(details=details)
    return location


def _note_body(data: dict) -> str:
    """A note's text from the request body (400 if blank or too long)."""
    body = validate.text(data.get("body"))
    if not body:
        raise BadRequest(details={"body": "Write something in the note"})
    if len(body) > MAX_NOTE:
        raise BadRequest(details={"body": f"A note must be at most {MAX_NOTE} characters"})
    return body


def _check_assignee(user: dict | None, team_id: int) -> None:
    """An assignee must be an active, available engineer on the incident's team (400 otherwise)."""
    if user is None or user["role"] != "engineer" or user["team_id"] != team_id:
        raise BadRequest(details={"assignee_id": "Choose an engineer from the incident's team"})
    if not user["is_active"]:
        raise BadRequest(details={"assignee_id": f"{user['name']} is no longer active"})
    if not user["is_available"]:
        raise BadRequest(details={"assignee_id": f"{user['name']} is marked as unavailable"})


def _id_text(value: int | None) -> str | None:
    """An id as stored in incident_events.from_value / to_value."""
    return None if value is None else str(value)


def _field_error(exc: pg_errors.Error) -> Exception:
    """A known constraint violation as a field-level 400; anything else is re-raised unchanged."""
    field_error = CONSTRAINT_ERRORS.get(exc.diag.constraint_name)
    return BadRequest(details=dict([field_error])) if field_error else exc


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
