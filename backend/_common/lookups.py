"""
Small reads more than one service needs, so each query is written once.
Service-specific queries stay in that service's repository.py.
"""

from psycopg import sql

from common.db import get_conn
from common.domain import ACTIVE_STATUSES

# How many active incidents user `u` holds. Needs the %(active)s parameter.
OPEN_INCIDENTS = sql.SQL("""(SELECT count(*) FROM incidents i
                              WHERE i.assignee_id = u.id AND i.status = ANY(%(active)s))""")


def get_user(user_id: int) -> dict | None:
    """A user's public profile (id, email, name, role, team, active, available, created), or None. Never the hash."""
    return get_conn().execute(
        """
        SELECT u.id, u.email, u.name, u.role, u.team_id, t.name AS team_name, u.is_active, u.is_available,
               u.created_at
        FROM users u LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.id = %s
        """,
        (user_id,),
    ).fetchone()


def get_engineer(user_id: int, active_only: bool = False) -> dict | None:
    """An engineer (as get_user), or None for anyone else, or for a deactivated engineer when active_only."""
    user = get_user(user_id)
    if user is None or user["role"] != "engineer" or (active_only and not user["is_active"]):
        return None
    return user


def get_team(team_id: int) -> dict | None:
    """A team's id and name, or None."""
    return get_conn().execute("SELECT id, name FROM teams WHERE id = %s", (team_id,)).fetchone()


def list_engineers(team_id: int | None = None, include_inactive: bool = False) -> list[dict]:
    """
    Engineers (all teams, or one), by name, with availability and how many active incidents they hold.
    Only active engineers unless include_inactive (the admin's engineer list shows deactivated ones too).
    """
    query = sql.SQL("""
        SELECT u.id, u.name, u.email, u.team_id, t.name AS team_name, u.is_available, u.is_active,
               {open_incidents} AS open_incidents
        FROM users u
        JOIN teams t ON t.id = u.team_id
        WHERE u.role = 'engineer'
          AND (u.is_active OR %(include_inactive)s)
          AND (%(team_id)s::int IS NULL OR u.team_id = %(team_id)s)
        ORDER BY u.name, u.id
    """).format(open_incidents=OPEN_INCIDENTS)
    params = {"team_id": team_id, "include_inactive": include_inactive, "active": list(ACTIVE_STATUSES)}
    return get_conn().execute(query, params).fetchall()


def open_incidents(user_id: int) -> int:
    """How many active incidents are assigned to the user."""
    query = sql.SQL("SELECT {} AS n FROM users u WHERE u.id = %(id)s").format(OPEN_INCIDENTS)
    row = get_conn().execute(query, {"id": user_id, "active": list(ACTIVE_STATUSES)}).fetchone()
    return row["n"] if row else 0


def engineer_feedback(engineer_id: int, limit: int | None = None) -> list[dict]:
    """Reporters' feedback on an engineer's work, latest first, with the incident and who gave it (all if no limit)."""
    query = """
        SELECT fb.incident_id, i.title AS incident_title, fb.rating, fb.comment, r.name AS reporter_name,
               fb.created_at, fb.updated_at
        FROM incident_feedback fb
        JOIN incidents i ON i.id = fb.incident_id
        JOIN users r     ON r.id = fb.reporter_id
        WHERE fb.engineer_id = %(engineer_id)s
        ORDER BY fb.updated_at DESC, fb.id DESC
        LIMIT %(limit)s
    """  # LIMIT NULL means no limit
    return get_conn().execute(query, {"engineer_id": engineer_id, "limit": limit}).fetchall()


def feedback_summary(engineer_id: int) -> dict:
    """An engineer's average rating (one decimal; None with no ratings) and how many ratings, all time."""
    query = """
        SELECT round(avg(rating), 1)::float AS average, count(*) AS ratings
        FROM incident_feedback
        WHERE engineer_id = %s
    """
    return get_conn().execute(query, (engineer_id,)).fetchone()
