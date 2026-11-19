"""
Facilities repository: SQL only. No rules, no permissions, no HTTP.
Every value is a query parameter; table and column names come from the TABLES whitelist and are
quoted with psycopg's sql module.
"""

from psycopg import sql

from common.db import get_conn

# Table -> columns callers may write.
TABLES = {
    "buildings": ("name",),
    "floors": ("building_id", "name"),
    "seats": ("floor_id", "code"),
    "categories": ("name", "type", "team_id"),
}

# What still points at a row, per table: (label, referencing table, referencing column).
# Incidents never cascade; floors and seats are removed by deleting them first.
USAGE = {
    "buildings": (("floors", "floors", "building_id"), ("incidents", "incidents", "building_id")),
    "floors": (("seats", "seats", "floor_id"), ("incidents", "incidents", "floor_id")),
    "seats": (("incidents", "incidents", "seat_id"),),
    "categories": (("incidents", "incidents", "category_id"),),
}


def _check(table: str, fields: dict | None = None) -> None:
    """Only known tables and columns may appear in SQL text."""
    if table not in TABLES:
        raise ValueError(f"Unknown table: {table}")
    unknown = set(fields or {}) - set(TABLES[table])
    if unknown:
        raise ValueError(f"Unknown column(s) for {table}: {sorted(unknown)}")


# --- lists (with how much uses each row, for the admin page) -----------------------

def list_buildings() -> list[dict]:
    """All buildings by name, with their floor and incident counts."""
    return get_conn().execute(
        """
        SELECT b.id, b.name,
               (SELECT count(*) FROM floors f WHERE f.building_id = b.id) AS floor_count,
               (SELECT count(*) FROM incidents i WHERE i.building_id = b.id) AS incident_count
        FROM buildings b
        ORDER BY b.name, b.id
        """
    ).fetchall()


def list_floors(building_id: int) -> list[dict]:
    """A building's floors in the order they were added, with seat and incident counts."""
    return get_conn().execute(
        """
        SELECT f.id, f.building_id, f.name,
               (SELECT count(*) FROM seats s WHERE s.floor_id = f.id) AS seat_count,
               (SELECT count(*) FROM incidents i WHERE i.floor_id = f.id) AS incident_count
        FROM floors f
        WHERE f.building_id = %s
        ORDER BY f.id
        """,
        (building_id,),
    ).fetchall()


def list_seats(floor_id: int) -> list[dict]:
    """A floor's seats by code, with incident counts."""
    return get_conn().execute(
        """
        SELECT s.id, s.floor_id, s.code,
               (SELECT count(*) FROM incidents i WHERE i.seat_id = s.id) AS incident_count
        FROM seats s
        WHERE s.floor_id = %s
        ORDER BY s.code, s.id
        """,
        (floor_id,),
    ).fetchall()


def list_categories() -> list[dict]:
    """All categories by name, with their team and incident counts."""
    return get_conn().execute(
        """
        SELECT c.id, c.name, c.type, c.team_id, t.name AS team_name,
               (SELECT count(*) FROM incidents i WHERE i.category_id = c.id) AS incident_count
        FROM categories c
        JOIN teams t ON t.id = c.team_id
        ORDER BY c.name, c.id
        """
    ).fetchall()


def list_teams() -> list[dict]:
    """All teams by name."""
    return get_conn().execute("SELECT id, name FROM teams ORDER BY name, id").fetchall()


# --- single rows and writes (any table in TABLES) -------------------------------

def get(table: str, row_id: int) -> dict | None:
    """One row, or None."""
    _check(table)
    query = sql.SQL("SELECT * FROM {} WHERE id = %s").format(sql.Identifier(table))
    return get_conn().execute(query, (row_id,)).fetchone()


def insert(table: str, fields: dict) -> dict:
    """Insert a row and return it."""
    _check(table, fields)
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({}) RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(", ").join(sql.Identifier(column) for column in fields),
        sql.SQL(", ").join(sql.Placeholder(column) for column in fields),
    )
    return get_conn().execute(query, fields).fetchone()


def update(table: str, row_id: int, fields: dict) -> dict | None:
    """Change a row's columns and return it, or None if it does not exist."""
    _check(table, fields)
    query = sql.SQL("UPDATE {} SET {} WHERE id = {} RETURNING *").format(
        sql.Identifier(table),
        sql.SQL(", ").join(
            sql.SQL("{} = {}").format(sql.Identifier(column), sql.Placeholder(column)) for column in fields
        ),
        sql.Placeholder("id"),
    )
    return get_conn().execute(query, {**fields, "id": row_id}).fetchone()


def delete(table: str, row_id: int) -> bool:
    """Delete a row; False if it did not exist."""
    _check(table)
    query = sql.SQL("DELETE FROM {} WHERE id = %s RETURNING id").format(sql.Identifier(table))
    return get_conn().execute(query, (row_id,)).fetchone() is not None


def usage(table: str, row_id: int) -> dict[str, int]:
    """How many rows still point at this one, e.g. {"floors": 2, "incidents": 5}."""
    _check(table)
    counts = {}
    for label, ref_table, ref_column in USAGE[table]:
        query = sql.SQL("SELECT count(*) AS n FROM {} WHERE {} = %s").format(
            sql.Identifier(ref_table), sql.Identifier(ref_column)
        )
        counts[label] = get_conn().execute(query, (row_id,)).fetchone()["n"]
    return counts
