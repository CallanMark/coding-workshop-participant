"""
Unit tests for the incidents service: identity from the token, role scope, and the status workflow.
The repository is replaced by an in-memory fake; requests go through the real Lambda handler.
"""

import json
from contextlib import nullcontext

import pytest

import function
import repository
import service
from common.auth import issue_token

# Same people as seed.sql. Team 1 = Facilities, team 2 = Workplace Technology.
ADMIN = {"id": 1, "role": "admin", "team_id": None}
EVE = {"id": 2, "role": "employee", "team_id": None}
SAM = {"id": 3, "role": "employee", "team_id": None}
FRED = {"id": 4, "role": "engineer", "team_id": 1}
TINA = {"id": 5, "role": "engineer", "team_id": 2}
MORGAN = {"id": 7, "role": "manager", "team_id": 2}
PAT = {"id": 8, "role": "manager", "team_id": 1}
FRED_TEAMMATE = {"id": 9, "role": "engineer", "team_id": 1}

# Who has exactly one relation to a Facilities incident reported by Eve and assigned to Fred.
ACTOR_FOR = {"assignee": FRED, "reporter": EVE, "manager": PAT, "admin": ADMIN}


def incident(status="open", team_id=1, reporter_id=EVE["id"], assignee_id=FRED["id"], **extra):
    """A raw incidents row."""
    return {
        "id": 10, "status": status, "team_id": team_id, "reporter_id": reporter_id, "assignee_id": assignee_id,
        "acknowledged_at": None, "resolved_at": None, "closed_at": None, **extra,
    }


@pytest.fixture
def repo(monkeypatch):
    """In-memory stand-in for repository.py; records what the service asked for."""
    state = {"incidents": {}, "events": [], "list_calls": [], "inserted": None}

    def lock_incident(incident_id):
        row = state["incidents"].get(incident_id)
        return dict(row) if row else None

    def update_status(incident_id, fields):
        state["incidents"][incident_id].update(fields)

    def insert_event(incident_id, actor_id, event_type, from_value=None, to_value=None, reason=None):
        state["events"].append({"incident_id": incident_id, "actor_id": actor_id, "type": event_type,
                                "from": from_value, "to": to_value, "reason": reason})

    def list_incidents(visible, mine_user_id=None):
        state["list_calls"].append((visible, mine_user_id))
        return []

    def insert_incident(fields):
        state["inserted"] = fields
        state["incidents"][99] = {"id": 99, "status": "open", **fields}
        return state["incidents"][99]

    monkeypatch.setattr(repository, "lock_incident", lock_incident)
    monkeypatch.setattr(repository, "get_incident", lambda i: state["incidents"].get(i))
    monkeypatch.setattr(repository, "update_status", update_status)
    monkeypatch.setattr(repository, "insert_event", insert_event)
    monkeypatch.setattr(repository, "list_incidents", list_incidents)
    monkeypatch.setattr(repository, "insert_incident", insert_incident)
    monkeypatch.setattr(repository, "get_category_team", {1: 1, 4: 2}.get)
    monkeypatch.setattr(service, "transaction", nullcontext)
    return state


def call(method, path, user=None, body=None, query=None):
    """Invoke the Lambda handler like the Function URL would; return (status, parsed body)."""
    event = {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "queryStringParameters": query,
        "headers": {"authorization": f"Bearer {issue_token(user)}"} if user else {},
        "body": json.dumps(body) if body is not None else None,
    }
    response = function.handler(event)
    return response["statusCode"], json.loads(response.get("body") or "null")


# --- sign-in and role on routes ---------------------------------------------------

@pytest.mark.parametrize("method,path", [
    ("GET", "/"), ("POST", "/"), ("PUT", "/10"), ("DELETE", "/10"), ("POST", "/10/status"), ("POST", "/10/escalate"),
])
def test_every_route_needs_a_token(repo, method, path):
    assert call(method, path)[0] == 401


@pytest.mark.parametrize("user", [EVE, FRED, PAT])
def test_delete_is_admin_only(repo, user):
    assert call("DELETE", "/10", user)[0] == 403


def test_admin_reaches_delete_stub(repo):
    assert call("DELETE", "/10", ADMIN)[0] == 501


# --- list scope -----------------------------------------------------------------

@pytest.mark.parametrize("user,visible", [
    (ADMIN, None),
    (EVE, {"reporter_id": 2, "assignee_id": 2}),
    (FRED, {"reporter_id": 4, "assignee_id": 4, "team_id": 1}),
    (MORGAN, {"reporter_id": 7, "assignee_id": 7, "team_id": 2}),
])
def test_list_is_scoped_to_the_role(repo, user, visible):
    assert call("GET", "/", user)[0] == 200
    assert repo["list_calls"] == [(visible, None)]


def test_list_mine_narrows_to_reported_or_assigned(repo):
    call("GET", "/", FRED, query={"mine": "true"})
    assert repo["list_calls"] == [({"reporter_id": 4, "assignee_id": 4, "team_id": 1}, 4)]


def test_list_ignores_user_id_from_the_query(repo):
    call("GET", "/", EVE, query={"user_id": "1"})
    assert repo["list_calls"][0][0] == {"reporter_id": 2, "assignee_id": 2}


def test_list_rejects_a_bad_mine_value(repo):
    status, body = call("GET", "/", EVE, query={"mine": "yes"})
    assert status == 400
    assert "mine" in body["error"]["details"]


# --- create ---------------------------------------------------------------------

def test_create_takes_the_reporter_from_the_token(repo):
    body = {"title": " Broken chair ", "category_id": 1, "building_id": 1, "reporter_id": 1}
    status, created = call("POST", "/", EVE, body)
    assert status == 201
    assert repo["inserted"]["reporter_id"] == EVE["id"]
    assert repo["inserted"]["title"] == "Broken chair"
    assert repo["inserted"]["team_id"] == 1  # routed by the category's team
    assert repo["events"] == [{"incident_id": 99, "actor_id": 2, "type": "created",
                               "from": None, "to": "open", "reason": None}]
    assert created["id"] == 99


def test_create_validation_names_each_field(repo):
    body = {"title": 42, "category_id": True, "building_id": "1", "floor_id": 1.5, "priority": "urgent"}
    status, error = call("POST", "/", EVE, body)
    assert status == 400
    assert set(error["error"]["details"]) == {"title", "category_id", "building_id", "floor_id", "priority"}


def test_create_unknown_category_is_a_field_error(repo):
    status, error = call("POST", "/", EVE, {"title": "x", "category_id": 777, "building_id": 1})
    assert status == 400
    assert "category_id" in error["error"]["details"]


# --- status workflow --------------------------------------------------------------

ALLOWED = [(move, who) for move, rule in service.TRANSITIONS.items() for who in sorted(rule["who"])]


@pytest.mark.parametrize("move,who", ALLOWED, ids=[f"{a}->{b} by {w}" for (a, b), w in ALLOWED])
def test_every_allowed_transition(repo, move, who):
    old, new = move
    repo["incidents"][10] = incident(status=old)
    actor = ACTOR_FOR[who]
    status, body = call("POST", "/10/status", actor, {"status": new, "reason": "needed", "actor_id": 999})

    assert status == 200, body
    assert repo["incidents"][10]["status"] == new
    event = repo["events"][-1]
    assert (event["type"], event["from"], event["to"]) == ("status_changed", old, new)
    assert event["actor_id"] == actor["id"]  # from the token, not the body


# One user who can see the incident but is not allowed to make the move.
NOT_ALLOWED = [
    (("open", "in_progress"), EVE), (("in_progress", "blocked"), EVE), (("blocked", "in_progress"), EVE),
    (("in_progress", "resolved"), FRED_TEAMMATE), (("resolved", "closed"), FRED),
    (("resolved", "in_progress"), FRED), (("open", "closed"), FRED_TEAMMATE),
]


@pytest.mark.parametrize("move,user", NOT_ALLOWED, ids=[f"{a}->{b}" for (a, b), _ in NOT_ALLOWED])
def test_visible_but_not_allowed_is_403(repo, move, user):
    repo["incidents"][10] = incident(status=move[0])
    status, _ = call("POST", "/10/status", user, {"status": move[1], "reason": "because"})
    assert status == 403
    assert repo["incidents"][10]["status"] == move[0]
    assert repo["events"] == []


@pytest.mark.parametrize("user", [TINA, MORGAN, SAM], ids=["other-team engineer", "other-team manager", "employee"])
def test_out_of_scope_is_404(repo, user):
    repo["incidents"][10] = incident(status="in_progress")
    assert call("POST", "/10/status", user, {"status": "resolved"})[0] == 404


def test_unknown_incident_is_404(repo):
    assert call("POST", "/10/status", ADMIN, {"status": "closed"})[0] == 404


@pytest.mark.parametrize("old,new", [("open", "resolved"), ("closed", "open"), ("blocked", "resolved")])
def test_invalid_transition_is_409(repo, old, new):
    repo["incidents"][10] = incident(status=old)
    assert call("POST", "/10/status", ADMIN, {"status": new, "reason": "x"})[0] == 409


def test_cannot_start_unassigned_work(repo):
    repo["incidents"][10] = incident(status="open", assignee_id=None)
    status, body = call("POST", "/10/status", PAT, {"status": "in_progress"})
    assert status == 409
    assert "Assign" in body["error"]["message"]


def test_reason_required_where_the_workflow_says_so(repo):
    repo["incidents"][10] = incident(status="in_progress")
    status, body = call("POST", "/10/status", FRED, {"status": "blocked", "reason": "  "})
    assert status == 400
    assert "reason" in body["error"]["details"]


def test_unknown_status_is_400(repo):
    repo["incidents"][10] = incident()
    assert call("POST", "/10/status", ADMIN, {"status": "done"})[0] == 400


def test_blocking_records_the_reason(repo):
    repo["incidents"][10] = incident(status="in_progress")
    call("POST", "/10/status", FRED, {"status": "blocked", "reason": "Waiting for parts"})
    assert repo["incidents"][10]["blocked_reason"] == "Waiting for parts"
    assert repo["events"][-1]["reason"] == "Waiting for parts"


def test_engineer_teammate_can_see_but_manager_relation_needs_same_team():
    item = incident(team_id=1, reporter_id=2, assignee_id=None)
    assert service._relations(item, FRED_TEAMMATE) == {"team"}
    assert service._relations(item, PAT) == {"team", "manager"}
    assert service._relations(item, MORGAN) == set()
    assert service._relations(item, ADMIN) == {"admin"}
