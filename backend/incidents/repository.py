"""
Incidents repository: SQL only. No rules, no permissions, no HTTP.
Every query uses parameters; callers wrap multi-step writes in common.db.transaction().
"""

from common.db import check_columns, get_conn, update_row
from common.domain import ACTIVE_STATUSES

# Incident columns plus display names for related rows.
INCIDENT_SELECT = """
    SELECT i.*,
           b.name AS building_name, f.name AS floor_name, s.code AS seat_code,
           c.name AS category_name, t.name AS team_name,
           r.name AS reporter_name, a.name AS assignee_name
    FROM incidents i
    JOIN buildings b       ON b.id = i.building_id
    LEFT JOIN floors f     ON f.id = i.floor_id
    LEFT JOIN seats s      ON s.id = i.seat_id
    JOIN categories c      ON c.id = i.category_id
    JOIN teams t           ON t.id = i.team_id
    JOIN users r           ON r.id = i.reporter_id
    LEFT JOIN users a      ON a.id = i.assignee_id
"""


# Columns a visibility rule may match on (never user input: keys come from service.visible_to).
SCOPE_COLUMNS = ("reporter_id", "assignee_id", "team_id")
# Columns a list filter may match on exactly (keys come from service._list_filters; None means IS NULL).
FILTER_COLUMNS = ("status", "priority", "category_id", "building_id", "assignee_id", "is_escalated")
# Columns update_incident may write.
UPDATABLE_COLUMNS = ("title", "description", "priority", "category_id", "team_id", "building_id",
                     "floor_id", "seat_id", "assignee_id", "assigned_at", "acknowledged_at",
                     "is_escalated", "escalation_reason", "updated_at")


def scope_where(visible: dict | None, mine_user_id: int | None, filters: dict | None = None) -> tuple[str, dict]:
    """
    The WHERE clause and parameters for a list query.
    `visible`: column -> value, any one matching is enough (None = every incident).
    `mine_user_id`: also require the user to be the reporter or the assignee.
    `filters`: column -> value, all must match; "q" is a text search on title and description.
    """
    clauses, params = [], {}
    if visible is not None:
        check_columns(visible, SCOPE_COLUMNS)
        any_of = [f"i.{column} = %(scope_{column})s" for column in visible]
        clauses.append("(" + " OR ".join(any_of) + ")" if any_of else "FALSE")
        params.update({f"scope_{column}": value for column, value in visible.items()})
    if mine_user_id is not None:
        clauses.append("(i.reporter_id = %(mine)s OR i.assignee_id = %(mine)s)")
        params["mine"] = mine_user_id
    filters = dict(filters or {})
    q = filters.pop("q", None)
    check_columns(filters, FILTER_COLUMNS)
    for column, value in filters.items():
        if value is None:
            clauses.append(f"i.{column} IS NULL")
        else:
            clauses.append(f"i.{column} = %(f_{column})s")
            params[f"f_{column}"] = value
    if q:
        clauses.append("(i.title ILIKE %(q)s OR i.description ILIKE %(q)s)")
        params["q"] = f"%{_escape_like(q)}%"
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), params


def _escape_like(text: str) -> str:
    """Search for the user's text literally: %, _ and \\ are LIKE wildcards / the escape character."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_incidents(visible: dict | None, mine_user_id: int | None = None, filters: dict | None = None) -> list[dict]:
    """Incidents matching the scope and filters (see scope_where), newest first."""
    where, params = scope_where(visible, mine_user_id, filters)
    query = INCIDENT_SELECT + where + " ORDER BY i.created_at DESC, i.id DESC"
    return get_conn().execute(query, params).fetchall()


# What the report form shows about a possible duplicate. The reporter may not be allowed to see the incident,
# so only its title and where it is: no id, status, description, people, notes or history.
DUPLICATE_SELECT = """
    SELECT i.title, c.name AS category_name, b.name AS building_name, f.name AS floor_name, s.code AS seat_code
    FROM incidents i
    JOIN buildings b   ON b.id = i.building_id
    LEFT JOIN floors f ON f.id = i.floor_id
    LEFT JOIN seats s  ON s.id = i.seat_id
    JOIN categories c  ON c.id = i.category_id
"""
# A possible duplicate: still active, and exactly the same category, building and floor (no floor matches no floor).
DUPLICATE_WHERE = """
    WHERE i.status = ANY(%(active)s)
      AND i.category_id = %(category_id)s
      AND i.building_id = %(building_id)s
      AND i.floor_id IS NOT DISTINCT FROM %(floor_id)s
"""


def find_duplicates(category_id: int, building_id: int, floor_id: int | None, limit: int) -> list[dict]:
    """Title and place of active incidents at the same place in the same category, newest first."""
    params = {"category_id": category_id, "building_id": building_id, "floor_id": floor_id, "limit": limit,
              "active": list(ACTIVE_STATUSES)}
    query = DUPLICATE_SELECT + DUPLICATE_WHERE + " ORDER BY i.created_at DESC, i.id DESC LIMIT %(limit)s"
    return get_conn().execute(query, params).fetchall()


def get_incident(incident_id: int) -> dict | None:
    """One incident with display names, or None."""
    return get_conn().execute(INCIDENT_SELECT + " WHERE i.id = %s", (incident_id,)).fetchone()


def lock_incident(incident_id: int) -> dict | None:
    """The raw incident row, locked until the surrounding transaction ends, or None."""
    return get_conn().execute("SELECT * FROM incidents WHERE id = %s FOR UPDATE", (incident_id,)).fetchone()


def get_category_team(category_id: int) -> int | None:
    """The team that owns a category, or None if the category does not exist."""
    row = get_conn().execute("SELECT team_id FROM categories WHERE id = %s", (category_id,)).fetchone()
    return row["team_id"] if row else None


def insert_incident(fields: dict) -> dict:
    """Insert an incident (status defaults to 'open') and return the new row."""
    return get_conn().execute(
        """
        INSERT INTO incidents (title, description, category_id, team_id, building_id,
                               floor_id, seat_id, reporter_id, priority)
        VALUES (%(title)s, %(description)s, %(category_id)s, %(team_id)s, %(building_id)s,
                %(floor_id)s, %(seat_id)s, %(reporter_id)s, %(priority)s)
        RETURNING *
        """,
        fields,
    ).fetchone()


def update_incident(incident_id: int, fields: dict) -> None:
    """Write the given columns (keys must be in UPDATABLE_COLUMNS)."""
    check_columns(fields, UPDATABLE_COLUMNS)
    update_row("incidents", incident_id, fields)


def delete_incident(incident_id: int) -> bool:
    """Delete an incident (notes and events cascade). False if it did not exist."""
    row = get_conn().execute("DELETE FROM incidents WHERE id = %s RETURNING id", (incident_id,)).fetchone()
    return row is not None


def update_status(incident_id: int, fields: dict) -> None:
    """Write the workflow columns: status, blocked_reason and the lifecycle timestamps."""
    get_conn().execute(
        """
        UPDATE incidents
        SET status = %(status)s,
            blocked_reason = %(blocked_reason)s,
            acknowledged_at = %(acknowledged_at)s,
            resolved_at = %(resolved_at)s,
            closed_at = %(closed_at)s,
            updated_at = %(updated_at)s
        WHERE id = %(id)s
        """,
        {**fields, "id": incident_id},
    )


def insert_event(incident_id: int, actor_id: int | None, event_type: str,
                 from_value: str | None = None, to_value: str | None = None, reason: str | None = None) -> None:
    """Append to the incident's audit trail (incident_events)."""
    get_conn().execute(
        """
        INSERT INTO incident_events (incident_id, actor_id, event_type, from_value, to_value, reason)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (incident_id, actor_id, event_type, from_value, to_value, reason),
    )



# --- notes and the audit trail ------------------------------------------------------

NOTE_SELECT = """
    SELECT n.id, n.incident_id, n.author_id, n.body, n.created_at,
           u.name AS author_name, u.role AS author_role
    FROM incident_notes n
    JOIN users u ON u.id = n.author_id
"""


def list_notes(incident_id: int) -> list[dict]:
    """An incident's notes, oldest first (a conversation)."""
    return get_conn().execute(NOTE_SELECT + " WHERE n.incident_id = %s ORDER BY n.created_at, n.id",
                              (incident_id,)).fetchall()


def get_note(incident_id: int, note_id: int) -> dict | None:
    """One note, only if it belongs to that incident; else None."""
    return get_conn().execute(NOTE_SELECT + " WHERE n.id = %s AND n.incident_id = %s",
                              (note_id, incident_id)).fetchone()


def insert_note(incident_id: int, author_id: int, body: str) -> int:
    """Add a note; returns its id."""
    row = get_conn().execute(
        "INSERT INTO incident_notes (incident_id, author_id, body) VALUES (%s, %s, %s) RETURNING id",
        (incident_id, author_id, body),
    ).fetchone()
    return row["id"]


def update_note(note_id: int, body: str) -> None:
    """Replace a note's text."""
    get_conn().execute("UPDATE incident_notes SET body = %s WHERE id = %s", (body, note_id))


def delete_note(note_id: int) -> None:
    """Delete a note."""
    get_conn().execute("DELETE FROM incident_notes WHERE id = %s", (note_id,))


def list_events(incident_id: int) -> list[dict]:
    """
    An incident's audit trail, oldest first, with display names: the actor, and for 'assigned' and
    'team_changed' the people or teams the stored ids refer to (compared as text: the values are text).
    """
    query = """
        SELECT e.id, e.event_type, e.from_value, e.to_value, e.reason, e.created_at,
               e.actor_id, a.name AS actor_name,
               COALESCE(fu.name, ft.name) AS from_name, COALESCE(tu.name, tt.name) AS to_name
        FROM incident_events e
        LEFT JOIN users a  ON a.id = e.actor_id
        LEFT JOIN users fu ON e.event_type = 'assigned'     AND fu.id::text = e.from_value
        LEFT JOIN users tu ON e.event_type = 'assigned'     AND tu.id::text = e.to_value
        LEFT JOIN teams ft ON e.event_type = 'team_changed' AND ft.id::text = e.from_value
        LEFT JOIN teams tt ON e.event_type = 'team_changed' AND tt.id::text = e.to_value
        WHERE e.incident_id = %s
        ORDER BY e.created_at, e.id
    """
    return get_conn().execute(query, (incident_id,)).fetchall()

# --- reporter feedback (private: never joined into INCIDENT_SELECT) ----------------

FEEDBACK_SELECT = """
    SELECT fb.id, fb.incident_id, fb.reporter_id, fb.engineer_id, fb.rating, fb.comment,
           fb.created_at, fb.updated_at,
           e.name AS engineer_name, e.team_id AS engineer_team_id, r.name AS reporter_name
    FROM incident_feedback fb
    JOIN users e ON e.id = fb.engineer_id
    JOIN users r ON r.id = fb.reporter_id
"""


def get_feedback(incident_id: int) -> dict | None:
    """The feedback on an incident, with the engineer's team (to find their manager), or None."""
    return get_conn().execute(FEEDBACK_SELECT + " WHERE fb.incident_id = %s", (incident_id,)).fetchone()


def save_feedback(incident_id: int, reporter_id: int, engineer_id: int, rating: int, comment: str | None) -> None:
    """Create the incident's feedback, or replace it (one per incident)."""
    get_conn().execute(
        """
        INSERT INTO incident_feedback (incident_id, reporter_id, engineer_id, rating, comment)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (incident_id) DO UPDATE
        SET engineer_id = EXCLUDED.engineer_id, rating = EXCLUDED.rating,
            comment = EXCLUDED.comment, updated_at = now()
        """,
        (incident_id, reporter_id, engineer_id, rating, comment),
    )
