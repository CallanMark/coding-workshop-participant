"""
Incidents service: list, create and change the status of incidents.

Routes (after the /api/incidents prefix is stripped):
    GET  /               list incidents (?user_id= limits to ones that user reported or is assigned)
    POST /               create an incident
    POST /{id}/status    move an incident to a new status (workflow rules enforced)
"""

import json
import logging
import os

from psycopg import connect, errors
from psycopg.rows import dict_row

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER') or 'postgres'} "
    f"password={os.getenv('POSTGRES_PASS') or 'postgres123'} "
    f"dbname={os.getenv('POSTGRES_NAME') or 'postgres'} "
    f"connect_timeout=15"
)

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

# Incident columns plus display names for related rows.
INCIDENT_SELECT = """
    SELECT i.*,
           b.name AS building_name, f.name AS floor_name, s.code AS seat_code,
           c.name AS category_name, r.name AS reporter_name, a.name AS assignee_name
    FROM incidents i
    JOIN buildings b       ON b.id = i.building_id
    LEFT JOIN floors f     ON f.id = i.floor_id
    LEFT JOIN seats s      ON s.id = i.seat_id
    LEFT JOIN categories c ON c.id = i.category_id
    JOIN users r           ON r.id = i.reporter_id
    LEFT JOIN users a      ON a.id = i.assignee_id
"""

# Reused across invocations in the same Lambda container.
PG_CONN = None


def get_conn():
    """Return an open autocommit connection, reconnecting if needed."""
    global PG_CONN
    if PG_CONN is None or PG_CONN.closed:
        PG_CONN = connect(PG_CONFIG, autocommit=True, row_factory=dict_row)
    return PG_CONN


def respond(status: int, body: object) -> dict:
    """Build a Lambda HTTP response with a JSON body."""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str),
    }


def error(status: int, message: str, details: dict | None = None) -> dict:
    """Build an error response in the shared error format."""
    return respond(status, {"error": {"message": message, "details": details or {}}})


# Requires the user to be logged in. No role/privilege check: any signed-in user.
def list_incidents(query: dict) -> dict:
    """Return incidents newest first; ?user_id= limits to ones that user reported or is assigned."""
    # TODO(auth): replace ?user_id= with the logged-in user (mine=true) once auth exists.
    user_id = query.get("user_id")
    if user_id is not None and not user_id.isdigit():
        return error(400, "Validation failed", {"user_id": "user_id must be an integer"})

    sql = INCIDENT_SELECT
    params = {}
    if user_id is not None:
        sql += " WHERE i.reporter_id = %(user_id)s OR i.assignee_id = %(user_id)s"
        params["user_id"] = int(user_id)
    sql += " ORDER BY i.created_at DESC, i.id DESC"

    with get_conn().cursor() as cur:
        cur.execute(sql, params)
        return respond(200, cur.fetchall())


# Requires the user to be logged in. No role/privilege check: any signed-in user.
def create_incident(data: dict) -> dict:
    """Validate the body and insert a new incident with status 'open'."""
    details = {}
    title = (data.get("title") or "").strip()
    if not title:
        details["title"] = "Title is required"
    for field in ("building_id", "reporter_id"):
        if not isinstance(data.get(field), int):
            details[field] = f"{field} is required and must be an integer"
    for field in ("category_id", "floor_id", "seat_id"):
        if data.get(field) is not None and not isinstance(data[field], int):
            details[field] = f"{field} must be an integer"
    priority = data.get("priority") or "medium"
    if priority not in PRIORITIES:
        details["priority"] = f"Priority must be one of {', '.join(PRIORITIES)}"
    if details:
        return error(400, "Validation failed", details)

    # TODO(auth): take reporter_id from the logged-in user instead of the body.
    params = {
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
        with get_conn().cursor() as cur:
            cur.execute(
                """
                INSERT INTO incidents (title, description, category_id, building_id,
                                       floor_id, seat_id, reporter_id, priority)
                VALUES (%(title)s, %(description)s, %(category_id)s, %(building_id)s,
                        %(floor_id)s, %(seat_id)s, %(reporter_id)s, %(priority)s)
                RETURNING *
                """,
                params,
            )
            return respond(201, cur.fetchone())
    except errors.ForeignKeyViolation as e:
        column = e.diag.constraint_name.removeprefix("incidents_").removesuffix("_fkey")
        return error(400, "Validation failed", {column: f"{column} does not exist"})


# Requires the user to be logged in. Who may move it depends on the transition
# (assignee / reporter / admin), checked against TRANSITIONS below.
def change_status(incident_id: int, data: dict) -> dict:
    """Move an incident to a new status, set its timestamps, and record any reason as a note."""
    new_status = data.get("status")
    reason = (data.get("reason") or "").strip()
    actor_id = data.get("actor_id")  # TODO(auth): use the logged-in user instead of the body.

    details = {}
    if new_status not in STATUSES:
        details["status"] = f"Status must be one of {', '.join(STATUSES)}"
    if not isinstance(actor_id, int):
        details["actor_id"] = "actor_id is required and must be an integer"
    if details:
        return error(400, "Validation failed", details)

    conn = get_conn()
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("SELECT role FROM users WHERE id = %s", (actor_id,))
        actor = cur.fetchone()
        if actor is None:
            return error(400, "Validation failed", {"actor_id": "actor_id does not exist"})

        cur.execute("SELECT * FROM incidents WHERE id = %s FOR UPDATE", (incident_id,))
        incident = cur.fetchone()

        # How the actor relates to this incident; no relation means it's out of scope (404).
        relations = set()
        if actor["role"] == "admin":
            relations.add("admin")
        if incident and incident["reporter_id"] == actor_id:
            relations.add("reporter")
        if incident and incident["assignee_id"] == actor_id:
            relations.add("assignee")
        if incident is None or not relations:
            return error(404, "Incident not found")

        old_status = incident["status"]
        rule = TRANSITIONS.get((old_status, new_status))
        if rule is None:
            return error(409, f"Cannot move an incident from {old_status} to {new_status}")
        if not relations & rule["who"]:
            allowed = " or ".join(sorted(rule["who"]))
            return error(403, f"Only the {allowed} can move an incident from {old_status} to {new_status}")
        if old_status == "open" and new_status == "in_progress" and incident["assignee_id"] is None:
            return error(409, "Assign an engineer before starting work")
        if rule["reason"] and not reason:
            return error(400, "Validation failed", {"reason": "A reason is required for this change"})

        # Fixed SQL fragments only; values always go through parameters.
        sets = ["status = %(status)s"]
        if old_status == "open" and new_status == "in_progress":
            sets.append("acknowledged_at = COALESCE(acknowledged_at, now())")
        if new_status == "blocked":
            sets.append("blocked_reason = %(reason)s")
        if old_status == "blocked":
            sets.append("blocked_reason = NULL")
        if new_status == "resolved":
            sets.append("resolved_at = now()")
        if old_status == "resolved" and new_status == "in_progress":
            sets.append("resolved_at = NULL")
        if new_status == "closed":
            sets.append("closed_at = now()")
        cur.execute(
            f"UPDATE incidents SET {', '.join(sets)} WHERE id = %(id)s",
            {"status": new_status, "reason": reason or None, "id": incident_id},
        )

        if reason:
            cur.execute(
                "INSERT INTO incident_notes (incident_id, author_id, body) VALUES (%s, %s, %s)",
                (incident_id, actor_id, f"Moved from {old_status} to {new_status}: {reason}"),
            )

        cur.execute(INCIDENT_SELECT + " WHERE i.id = %s", (incident_id,))
        return respond(200, cur.fetchone())


def parse_body(event: dict) -> dict | None:
    """Return the JSON body as a dict, or None if it is not a valid JSON object."""
    try:
        data = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def handler(event: dict | None = None, context: object = None) -> dict:
    """Route the request by HTTP method and path."""
    event = event or {}
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod", "GET")
    path = event.get("rawPath") or event.get("path") or "/"
    parts = [p for p in path.split("/") if p and p not in ("api", "incidents")]
    query = event.get("queryStringParameters") or {}

    try:
        if not parts and method == "GET":
            return list_incidents(query)
        if method == "POST" and (not parts or (len(parts) == 2 and parts[0].isdigit() and parts[1] == "status")):
            data = parse_body(event)
            if data is None:
                return error(400, "Request body must be a JSON object")
            return create_incident(data) if not parts else change_status(int(parts[0]), data)
        return error(404, "Route not found")
    except Exception:
        logger.exception("Unhandled error")
        return error(500, "Internal server error")
