"""
Auth repository: SQL only. No rules, no permissions, no HTTP.
"""

from common.db import check_columns, get_conn, update_row


def get_credentials(email: str) -> dict | None:
    """id, password_hash and is_active for a login attempt, or None if the email is unknown."""
    return get_conn().execute(
        "SELECT id, password_hash, is_active FROM users WHERE email = %s", (email,)
    ).fetchone()


def insert_user(fields: dict) -> int:
    """Insert a user and return the new id. A team_id that doesn't exist raises ForeignKeyViolation."""
    row = get_conn().execute(
        """
        INSERT INTO users (email, password_hash, name, role, team_id, created_by)
        VALUES (%(email)s, %(password_hash)s, %(name)s, %(role)s, %(team_id)s, %(created_by)s)
        RETURNING id
        """,
        fields,
    ).fetchone()
    return row["id"]


# The engineer profile fields an admin may change.
ENGINEER_COLUMNS = ("name", "team_id", "is_available", "is_active")


def update_engineer(user_id: int, fields: dict) -> None:
    """Write the given profile columns (keys must be in ENGINEER_COLUMNS)."""
    check_columns(fields, ENGINEER_COLUMNS)
    update_row("users", user_id, fields)
