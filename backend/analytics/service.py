"""
Analytics service layer: who may see which dashboard, and the shape of each one.
Raises common.errors.ApiError subclasses; never builds HTTP responses or SQL.

Access:
- Team dashboard: engineers and the manager on that team, or an admin.
- Engineer dashboard: the engineer themselves, the manager of their team, or an admin.
  Reporter feedback (ratings) is only included when someone other than the engineer is looking:
  an engineer never receives their own ratings.
- Location hotspots: admin only (checked on the route).
"""

import repository
from common import lookups
from common.auth import manages
from common.domain import ACTIVE_STATUSES, PRIORITIES
from common.errors import BadRequest, Forbidden, NotFound
from common.http import Request

WINDOWS = (7, 30, 90)  # days a dashboard can look back
DEFAULT_WINDOW = 30
SPEEDS = ("acknowledge", "assign", "resolve")


def team_dashboard(req: Request) -> dict:
    """A team's open work, most common categories and how fast it is handled."""
    team = lookups.get_team(req.params["id"])
    if team is None:
        raise NotFound("Team not found")
    user = req.user
    if user["role"] != "admin" and user["team_id"] != team["id"]:
        raise Forbidden("You can only see your own team's dashboard")
    days = _days(req)
    return {"team": team, "days": days, **_summary({"team_id": team["id"], "assignee_id": None}, days)}


def engineer_dashboard(req: Request) -> dict:
    """One engineer's work and speed; their feedback too when their manager or an admin is looking."""
    engineer = lookups.get_engineer(req.params["id"], active_only=True)
    if engineer is None:
        raise NotFound("Engineer not found")
    user = req.user
    own = user["id"] == engineer["id"]
    if not (own or manages(user, engineer["team_id"]) or user["role"] == "admin"):
        raise Forbidden("You can only see your own dashboard, or those of engineers on the team you manage")
    days = _days(req)
    dashboard = {
        "engineer": {key: engineer[key] for key in ("id", "name", "team_id", "team_name", "is_available")},
        "days": days,
        **_summary({"team_id": None, "assignee_id": engineer["id"]}, days),
    }
    if not own:  # never send an engineer their own ratings
        recent = lookups.engineer_feedback(engineer["id"], limit=repository.RECENT)
        dashboard["feedback"] = {**lookups.feedback_summary(engineer["id"]), "recent": recent}
    return dashboard


def location_hotspots(req: Request) -> dict:
    """Admin: buildings, floors and seats with the most recurring issues in the window."""
    days = _days(req)
    return {"days": days, **{level: repository.hotspots(level, days) for level in repository.LEVELS}}


# --- helpers ---------------------------------------------------------------------------

def _days(req: Request) -> int:
    """The ?days= window: 7, 30 or 90 (default 30); 400 otherwise."""
    raw = req.query.get("days", str(DEFAULT_WINDOW))
    if raw not in {str(window) for window in WINDOWS}:
        raise BadRequest(details={"days": "Days must be 7, 30 or 90"})
    return int(raw)


def _summary(scope: dict, days: int) -> dict:
    """The sections shared by the team and engineer dashboards."""
    speed = repository.speed(scope, days)
    return {
        "open": _open_totals(repository.open_counts(scope)),
        "oldest_open": repository.oldest_open(scope),
        "categories": repository.top_categories(scope, days),
        "speed": {
            "reported": speed["reported"],
            "resolved": speed["resolved"],
            "median_seconds": {key: _whole_seconds(speed[key]) for key in SPEEDS},
        },
    }


def _open_totals(groups: list[dict]) -> dict:
    """Total active incidents, by status and by priority (every value present, zero if none), and escalated."""
    by_status = dict.fromkeys(ACTIVE_STATUSES, 0)
    by_priority = dict.fromkeys(PRIORITIES, 0)
    escalated = 0
    for group in groups:
        by_status[group["status"]] += group["incidents"]
        by_priority[group["priority"]] += group["incidents"]
        escalated += group["incidents"] if group["is_escalated"] else 0
    return {"total": sum(by_status.values()), "escalated": escalated, "by_status": by_status,
            "by_priority": by_priority}


def _whole_seconds(value: float | None) -> int | None:
    """Round a median to whole seconds; None stays None (nothing to measure)."""
    return None if value is None else round(value)
