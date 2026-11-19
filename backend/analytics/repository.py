"""
Analytics repository: read-only SQL. No rules, no permissions, no HTTP.

Dashboards are scoped by a `scope` dict: {"team_id": int | None, "assignee_id": int | None}.
A None side matches everything, so the same queries serve a team and a single engineer.
Every value is a query parameter; statuses come from common.domain. The only SQL composed at runtime is
the location ranking, from the fixed LEVELS whitelist via psycopg's sql module.
Users and teams are looked up with common.lookups.
"""

from psycopg import sql

from common.db import get_conn
from common.domain import ACTIVE_STATUSES

RECENT = 5  # oldest open incidents and latest feedback shown on a dashboard
TOP = 10  # rows in each ranking


def _params(scope: dict, **extra) -> dict:
    """Query parameters: the scope, the active statuses, and anything else the query needs."""
    return {**scope, "active": list(ACTIVE_STATUSES), **extra}


def open_counts(scope: dict) -> list[dict]:
    """Active incidents in scope, counted per (status, priority, escalated) combination."""
    query = """
        SELECT i.status, i.priority, i.is_escalated, count(*) AS incidents
        FROM incidents i
        WHERE i.status = ANY(%(active)s)
          AND (%(team_id)s::int IS NULL OR i.team_id = %(team_id)s)
          AND (%(assignee_id)s::int IS NULL OR i.assignee_id = %(assignee_id)s)
        GROUP BY i.status, i.priority, i.is_escalated
    """
    return get_conn().execute(query, _params(scope)).fetchall()


def oldest_open(scope: dict) -> list[dict]:
    """The active incidents in scope that have waited longest, with who has them."""
    query = """
        SELECT i.id, i.title, i.status, i.priority, i.is_escalated, i.created_at, u.name AS assignee_name
        FROM incidents i
        LEFT JOIN users u ON u.id = i.assignee_id
        WHERE i.status = ANY(%(active)s)
          AND (%(team_id)s::int IS NULL OR i.team_id = %(team_id)s)
          AND (%(assignee_id)s::int IS NULL OR i.assignee_id = %(assignee_id)s)
        ORDER BY i.created_at, i.id
        LIMIT %(limit)s
    """
    return get_conn().execute(query, _params(scope, limit=RECENT)).fetchall()


def top_categories(scope: dict, days: int) -> list[dict]:
    """Categories in scope by how many incidents were reported in the last `days` days, most first."""
    query = """
        SELECT c.id, c.name, c.type, count(*) AS incidents
        FROM incidents i
        JOIN categories c ON c.id = i.category_id
        WHERE i.created_at >= now() - make_interval(days => %(days)s)
          AND (%(team_id)s::int IS NULL OR i.team_id = %(team_id)s)
          AND (%(assignee_id)s::int IS NULL OR i.assignee_id = %(assignee_id)s)
        GROUP BY c.id, c.name, c.type
        ORDER BY incidents DESC, c.name
        LIMIT %(limit)s
    """
    return get_conn().execute(query, _params(scope, days=days, limit=TOP)).fetchall()


def speed(scope: dict, days: int) -> dict:
    """
    How fast incidents in scope are handled, as medians in seconds (None when there is nothing to measure):
    acknowledge and assign for incidents reported in the window, resolve for incidents resolved in it.
    Medians, not averages, so one ticket that sat for a week doesn't hide how most are handled.
    """
    query = """
        SELECT
          count(*) FILTER (WHERE i.created_at >= w.since)  AS reported,
          count(*) FILTER (WHERE i.resolved_at >= w.since) AS resolved,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.acknowledged_at - i.created_at))
            FILTER (WHERE i.created_at >= w.since) AS acknowledge,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.assigned_at - i.created_at))
            FILTER (WHERE i.created_at >= w.since) AS assign,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i.resolved_at - i.created_at))
            FILTER (WHERE i.resolved_at >= w.since) AS resolve
        FROM incidents i
        CROSS JOIN (SELECT now() - make_interval(days => %(days)s) AS since) w
        WHERE (%(team_id)s::int IS NULL OR i.team_id = %(team_id)s)
          AND (%(assignee_id)s::int IS NULL OR i.assignee_id = %(assignee_id)s)
    """
    return get_conn().execute(query, _params(scope, days=days)).fetchone()


def feedback_summary(engineer_id: int) -> dict:
    """An engineer's average rating (one decimal) and how many ratings, all time."""
    query = """
        SELECT round(avg(rating), 1)::float AS average, count(*) AS ratings
        FROM incident_feedback
        WHERE engineer_id = %s
    """
    return get_conn().execute(query, (engineer_id,)).fetchone()


def recent_feedback(engineer_id: int) -> list[dict]:
    """An engineer's latest feedback, newest first, with the incident and who gave it."""
    query = """
        SELECT fb.incident_id, i.title AS incident_title, fb.rating, fb.comment, r.name AS reporter_name,
               fb.updated_at
        FROM incident_feedback fb
        JOIN incidents i ON i.id = fb.incident_id
        JOIN users r     ON r.id = fb.reporter_id
        WHERE fb.engineer_id = %s
        ORDER BY fb.updated_at DESC, fb.id DESC
        LIMIT %s
    """
    return get_conn().execute(query, (engineer_id, RECENT)).fetchall()


# --- location hotspots -----------------------------------------------------------------
# An incident is "recurring" when the same category was already reported at the same place
# in the 30 days before it. "Same place" is the level being ranked: building, floor or seat.

# Level -> the incidents column that identifies the place, what to show for it, and how to break ties.
LEVELS = {
    "buildings": {
        "column": "building_id",
        "columns": sql.SQL("b.id, b.name"),
        "joins": sql.SQL("JOIN buildings b ON b.id = r.place_id"),
        "order": sql.SQL("b.name"),
    },
    "floors": {
        "column": "floor_id",
        "columns": sql.SQL("f.id, f.name, b.name AS building_name"),
        "joins": sql.SQL("JOIN floors f ON f.id = r.place_id JOIN buildings b ON b.id = f.building_id"),
        "order": sql.SQL("b.name, f.name"),
    },
    "seats": {
        "column": "seat_id",
        "columns": sql.SQL("s.id, s.code, f.name AS floor_name, b.name AS building_name"),
        "joins": sql.SQL(
            "JOIN seats s ON s.id = r.place_id JOIN floors f ON f.id = s.floor_id"
            " JOIN buildings b ON b.id = f.building_id"
        ),
        "order": sql.SQL("b.name, s.code"),
    },
}

HOTSPOTS = sql.SQL("""
    WITH recent AS (
      SELECT i.{place} AS place_id,
             EXISTS (SELECT 1 FROM incidents p
                      WHERE p.{place} = i.{place} AND p.category_id = i.category_id
                        AND p.created_at < i.created_at
                        AND p.created_at >= i.created_at - interval '30 days') AS recurring
      FROM incidents i
      WHERE i.{place} IS NOT NULL AND i.created_at >= now() - make_interval(days => %(days)s)
    ),
    counted AS (
      SELECT place_id, count(*) AS incidents, count(*) FILTER (WHERE recurring) AS recurring
      FROM recent
      GROUP BY place_id
    )
    SELECT {columns}, r.incidents, r.recurring
    FROM counted r
    {joins}
    ORDER BY r.recurring DESC, r.incidents DESC, {order}
    LIMIT %(limit)s
""")


def hotspots(level: str, days: int) -> list[dict]:
    """
    The places at one level ("buildings", "floors" or "seats") with the most recurring incidents reported
    in the last `days` days, then the most incidents overall.
    """
    if level not in LEVELS:
        raise ValueError(f"Unknown level: {level}")
    spec = LEVELS[level]
    query = HOTSPOTS.format(
        place=sql.Identifier(spec["column"]), columns=spec["columns"], joins=spec["joins"], order=spec["order"]
    )
    return get_conn().execute(query, {"days": days, "limit": TOP}).fetchall()
