"""
Small reads more than one service needs, so each query is written once.
Service-specific queries stay in that service's repository.py.
"""

from common.db import get_conn


def get_user(user_id: int) -> dict | None:
    """A user's id, name, role, team and whether they are active and available, or None."""
    return get_conn().execute(
        """
        SELECT u.id, u.name, u.role, u.team_id, t.name AS team_name, u.is_active, u.is_available
        FROM users u LEFT JOIN teams t ON t.id = u.team_id
        WHERE u.id = %s
        """,
        (user_id,),
    ).fetchone()


def get_team(team_id: int) -> dict | None:
    """A team's id and name, or None."""
    return get_conn().execute("SELECT id, name FROM teams WHERE id = %s", (team_id,)).fetchone()
