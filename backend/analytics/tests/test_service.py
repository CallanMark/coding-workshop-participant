"""
Unit tests for the analytics service: who may see which dashboard, the ?days= window, the response shape,
and that an engineer never receives their own feedback.
The repository is replaced by a fake that records each call; requests go through the real Lambda handler.
"""

import json

import pytest

import function
import repository
from common import lookups
from common.auth import issue_token

ADMIN = {"id": 1, "role": "admin", "team_id": None}
EVE = {"id": 2, "role": "employee", "team_id": None}
FRED = {"id": 4, "role": "engineer", "team_id": 1}
TINA = {"id": 5, "role": "engineer", "team_id": 2}
MORGAN = {"id": 7, "role": "manager", "team_id": 2}
PAT = {"id": 8, "role": "manager", "team_id": 1}

USERS = {
    4: {"id": 4, "name": "Fred Facilities", "role": "engineer", "team_id": 1, "team_name": "Facilities",
        "is_available": True, "is_active": True},
    5: {"id": 5, "name": "Tina Tech", "role": "engineer", "team_id": 2, "team_name": "Workplace Technology",
        "is_available": True, "is_active": True},
    6: {"id": 6, "name": "Omar Offline", "role": "engineer", "team_id": 2, "team_name": "Workplace Technology",
        "is_available": False, "is_active": False},
    7: {"id": 7, "name": "Morgan Manager", "role": "manager", "team_id": 2, "team_name": "Workplace Technology",
        "is_available": True, "is_active": True},
}
GROUPS = [  # open_counts: incidents per (status, priority, escalated)
    {"status": "open", "priority": "medium", "is_escalated": False, "incidents": 2},
    {"status": "blocked", "priority": "high", "is_escalated": True, "incidents": 1},
    {"status": "in_progress", "priority": "medium", "is_escalated": False, "incidents": 1},
]
FEEDBACK = {"average": 3.0, "ratings": 1}


@pytest.fixture
def calls(monkeypatch):
    """Fake every repository read; returns the list of (function, args) calls made."""
    made = []

    def fake(name, result):
        def record(*args):
            made.append((name, args))
            return result
        monkeypatch.setattr(repository, name, record)

    monkeypatch.setattr(lookups, "get_team",
                        lambda team_id: {1: {"id": 1, "name": "Facilities"},
                                         2: {"id": 2, "name": "Workplace Technology"}}.get(team_id))
    monkeypatch.setattr(lookups, "get_user", USERS.get)
    fake("open_counts", GROUPS)
    fake("oldest_open", [{"id": 3, "title": "Wi-Fi drops"}])
    fake("top_categories", [{"id": 5, "name": "Network", "type": "technology", "incidents": 2}])
    fake("speed", {"reported": 4, "resolved": 2, "acknowledge": 3599.6, "assign": 1800.0, "resolve": None})
    fake("feedback_summary", FEEDBACK)
    fake("recent_feedback", [{"incident_id": 5, "rating": 3, "comment": "Slow to hear back"}])
    fake("hotspots", [{"id": 1, "incidents": 3, "recurring": 1}])
    return made


def call(path, user, query=None, token=True):
    """GET /api/analytics<path> as `user` through the Lambda handler; returns (status, body)."""
    headers = {"authorization": f"Bearer {issue_token(user)}"} if token else {}
    res = function.handler({
        "requestContext": {"http": {"method": "GET"}},
        "rawPath": f"/api/analytics{path}",
        "queryStringParameters": query,
        "headers": headers,
    })
    return res["statusCode"], json.loads(res.get("body") or "null")


# --- team dashboard -------------------------------------------------------------------

@pytest.mark.parametrize("user", [MORGAN, TINA, ADMIN])
def test_team_dashboard_for_its_engineers_manager_and_admins(calls, user):
    status, body = call("/teams/2", user)
    assert status == 200
    assert body["team"] == {"id": 2, "name": "Workplace Technology"}
    assert ("open_counts", ({"team_id": 2, "assignee_id": None},)) in calls


@pytest.mark.parametrize("user", [PAT, FRED])
def test_other_teams_cannot_see_a_team_dashboard(calls, user):
    status, body = call("/teams/2", user)
    assert status == 403
    assert body["error"]["message"] == "You can only see your own team's dashboard"
    assert calls == []  # nothing was read


def test_reporters_have_no_dashboards(calls):
    assert call("/teams/1", EVE)[0] == 403
    assert call("/engineers/4", EVE)[0] == 403


def test_signing_in_is_required(calls):
    assert call("/teams/1", ADMIN, token=False)[0] == 401


def test_unknown_team_is_404(calls):
    assert call("/teams/9", ADMIN) == (404, {"error": {"message": "Team not found", "details": {}}})


def test_dashboard_shape(calls):
    _, body = call("/teams/2", MORGAN)
    assert body["days"] == 30
    # every status and priority is present, zero when nothing matches
    assert body["open"] == {
        "total": 4, "escalated": 1,
        "by_status": {"open": 2, "in_progress": 1, "blocked": 1},
        "by_priority": {"low": 0, "medium": 3, "high": 1, "critical": 0},
    }
    assert body["oldest_open"] == [{"id": 3, "title": "Wi-Fi drops"}]
    assert body["categories"][0]["name"] == "Network"
    # medians are whole seconds; nothing to measure stays null
    assert body["speed"] == {"reported": 4, "resolved": 2,
                             "median_seconds": {"acknowledge": 3600, "assign": 1800, "resolve": None}}


# --- the time window ------------------------------------------------------------------

@pytest.mark.parametrize("days", ["7", "30", "90"])
def test_window_is_passed_to_the_queries(calls, days):
    status, body = call("/teams/1", PAT, {"days": days})
    assert status == 200 and body["days"] == int(days)
    assert ("speed", ({"team_id": 1, "assignee_id": None}, int(days))) in calls


@pytest.mark.parametrize("days", ["5", "abc", "-30", ""])
def test_other_windows_are_rejected(calls, days):
    status, body = call("/teams/1", PAT, {"days": days})
    assert status == 400
    assert body["error"]["details"] == {"days": "Days must be 7, 30 or 90"}


# --- engineer dashboard ---------------------------------------------------------------

def test_engineers_see_their_own_dashboard_without_their_ratings(calls):
    status, body = call("/engineers/5", TINA)
    assert status == 200
    assert body["engineer"] == {"id": 5, "name": "Tina Tech", "team_id": 2, "team_name": "Workplace Technology",
                                "is_available": True}
    assert "feedback" not in body
    assert not any(name in ("feedback_summary", "recent_feedback") for name, _ in calls)
    assert ("open_counts", ({"team_id": None, "assignee_id": 5},)) in calls


@pytest.mark.parametrize("user", [MORGAN, ADMIN])
def test_their_manager_and_admins_also_see_feedback(calls, user):
    status, body = call("/engineers/5", user)
    assert status == 200
    assert body["feedback"] == {**FEEDBACK, "recent": [{"incident_id": 5, "rating": 3, "comment": "Slow to hear back"}]}


@pytest.mark.parametrize("user", [PAT, FRED])
def test_other_managers_and_engineers_cannot_see_it(calls, user):
    status, body = call("/engineers/5", user)
    assert status == 403
    assert "feedback" not in body
    assert calls == []


@pytest.mark.parametrize("engineer_id", [7, 6, 99])  # a manager, a deactivated engineer, nobody
def test_only_active_engineers_have_a_dashboard(calls, engineer_id):
    status, body = call(f"/engineers/{engineer_id}", ADMIN)
    assert (status, body["error"]["message"]) == (404, "Engineer not found")


# --- location hotspots ----------------------------------------------------------------

def test_admins_see_location_hotspots(calls):
    status, body = call("/locations", ADMIN, {"days": "90"})
    assert status == 200
    assert body["days"] == 90
    assert set(body) == {"days", "buildings", "floors", "seats"}
    assert [args for name, args in calls if name == "hotspots"] == [("buildings", 90), ("floors", 90), ("seats", 90)]


@pytest.mark.parametrize("user", [MORGAN, TINA, EVE])
def test_only_admins_see_location_hotspots(calls, user):
    assert call("/locations", user)[0] == 403
