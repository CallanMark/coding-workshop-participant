"""
Incidents repository: SQL only. No rules, no permissions, no HTTP.
Every query uses parameters; callers wrap multi-step writes in common.db.transaction().
"""

from common.db import get_conn

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


def list_incidents(user_id: int | None = None) -> list[dict]:
    """All incidents newest first, or only those `user_id` reported or is assigned to."""
    if user_id is None:
        sql = INCIDENT_SELECT + " ORDER BY i.created_at DESC, i.id DESC"
    else:
        sql = (INCIDENT_SELECT
               + " WHERE i.reporter_id = %(user_id)s OR i.assignee_id = %(user_id)s"
               + " ORDER BY i.created_at DESC, i.id DESC")
    return get_conn().execute(sql, {"user_id": user_id}).fetchall()


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


def get_user_role(user_id: int) -> str | None:
    """A user's role, or None if the user does not exist. (users is owned by auth; read-only here.)"""
    row = get_conn().execute("SELECT role FROM users WHERE id = %s", (user_id,)).fetchone()
    return row["role"] if row else None
