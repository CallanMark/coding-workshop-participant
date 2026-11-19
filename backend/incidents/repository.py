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


# Columns a visibility rule may match on (never user input: keys come from service.visible_to).
SCOPE_COLUMNS = ("reporter_id", "assignee_id", "team_id")


def scope_where(visible: dict | None, mine_user_id: int | None) -> tuple[str, dict]:
    """
    The WHERE clause and parameters for a list query.
    `visible`: column -> value, any one matching is enough (None = every incident).
    `mine_user_id`: also require the user to be the reporter or the assignee.
    """
    clauses, params = [], {}
    if visible is not None:
        unknown = set(visible) - set(SCOPE_COLUMNS)
        if unknown:
            raise ValueError(f"Unknown scope column(s): {sorted(unknown)}")
        any_of = [f"i.{column} = %(scope_{column})s" for column in visible]
        clauses.append("(" + " OR ".join(any_of) + ")" if any_of else "FALSE")
        params.update({f"scope_{column}": value for column, value in visible.items()})
    if mine_user_id is not None:
        clauses.append("(i.reporter_id = %(mine)s OR i.assignee_id = %(mine)s)")
        params["mine"] = mine_user_id
    return (" WHERE " + " AND ".join(clauses) if clauses else ""), params


def list_incidents(visible: dict | None, mine_user_id: int | None = None) -> list[dict]:
    """Incidents matching the scope (see scope_where), newest first."""
    where, params = scope_where(visible, mine_user_id)
    sql = INCIDENT_SELECT + where + " ORDER BY i.created_at DESC, i.id DESC"
    return get_conn().execute(sql, params).fetchall()


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
