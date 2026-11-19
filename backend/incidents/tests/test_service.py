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
from common import lookups
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
    state = {"incidents": {}, "events": [], "list_calls": [], "inserted": None, "updates": [], "duplicate_calls": []}

    def lock_incident(incident_id):
        row = state["incidents"].get(incident_id)
        return dict(row) if row else None

    def update_status(incident_id, fields):
        state["incidents"][incident_id].update(fields)

    def insert_event(incident_id, actor_id, event_type, from_value=None, to_value=None, reason=None):
        state["events"].append({"incident_id": incident_id, "actor_id": actor_id, "type": event_type,
                                "from": from_value, "to": to_value, "reason": reason})

    def list_incidents(visible, mine_user_id=None, filters=None):
        state["list_calls"].append((visible, mine_user_id, filters))
        return []

    def update_incident(incident_id, fields):
        state["updates"].append(fields)
        state["incidents"][incident_id].update(fields)

    def delete_incident(incident_id):
        return state["incidents"].pop(incident_id, None) is not None

    def find_duplicates(category_id, building_id, floor_id, limit):
        state["duplicate_calls"].append((category_id, building_id, floor_id, limit))
        return [{"id": 1, "title": "Air con not working"}]

    def get_duplicate(incident_id, category_id, building_id, floor_id):
        match = (incident_id, category_id, building_id, floor_id) == (1, 1, 1, 1)
        return {"id": 1, "title": "Air con not working"} if match else None

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
    monkeypatch.setattr(repository, "update_incident", update_incident)
    monkeypatch.setattr(repository, "delete_incident", delete_incident)
    monkeypatch.setattr(repository, "find_duplicates", find_duplicates)
    monkeypatch.setattr(repository, "get_duplicate", get_duplicate)
    monkeypatch.setattr(repository, "get_category_team", {1: 1, 4: 2}.get)
    state["feedback"] = {}
    users = {u["id"]: {**u, "name": f"User {u['id']}", "team_name": None, "is_active": True, "is_available": True}
             for u in (ADMIN, EVE, SAM, FRED, TINA, MORGAN, PAT, FRED_TEAMMATE)}
    state["users"] = users

    def get_feedback(incident_id):
        row = state["feedback"].get(incident_id)
        return {**row, "engineer_team_id": users[row["engineer_id"]]["team_id"]} if row else None

    def save_feedback(incident_id, reporter_id, engineer_id, rating, comment):
        state["feedback"][incident_id] = {"incident_id": incident_id, "reporter_id": reporter_id,
                                          "engineer_id": engineer_id, "rating": rating, "comment": comment}

    def engineer_feedback(engineer_id, limit=None):
        return [row for row in state["feedback"].values() if row["engineer_id"] == engineer_id][:limit]

    def feedback_summary(engineer_id):
        ratings = [row["rating"] for row in engineer_feedback(engineer_id)]
        return {"average": round(sum(ratings) / len(ratings), 1) if ratings else None, "ratings": len(ratings)}

    monkeypatch.setattr(repository, "get_feedback", get_feedback)
    monkeypatch.setattr(repository, "save_feedback", save_feedback)
    monkeypatch.setattr(lookups, "get_user", users.get)
    monkeypatch.setattr(lookups, "engineer_feedback", engineer_feedback)
    monkeypatch.setattr(lookups, "feedback_summary", feedback_summary)
    state["notes"] = {}

    def get_note(incident_id, note_id):
        note = state["notes"].get(note_id)
        return dict(note) if note and note["incident_id"] == incident_id else None

    def insert_note(incident_id, author_id, body):
        note_id = len(state["notes"]) + 1
        state["notes"][note_id] = {"id": note_id, "incident_id": incident_id, "author_id": author_id, "body": body}
        return note_id

    monkeypatch.setattr(repository, "list_notes",
                        lambda i: [n for n in state["notes"].values() if n["incident_id"] == i])
    monkeypatch.setattr(repository, "get_note", get_note)
    monkeypatch.setattr(repository, "insert_note", insert_note)
    monkeypatch.setattr(repository, "update_note", lambda note_id, body: state["notes"][note_id].update(body=body))
    monkeypatch.setattr(repository, "delete_note", lambda note_id: state["notes"].pop(note_id))
    monkeypatch.setattr(repository, "list_events",
                        lambda i: [e for e in state["events"] if e["incident_id"] == i])
    state["engineer_calls"] = []

    def list_engineers(team_id):
        state["engineer_calls"].append(team_id)
        return [{"id": 4, "name": "Fred Facilities", "team_id": 1}]

    monkeypatch.setattr(lookups, "list_engineers", list_engineers)
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
    ("GET", "/"), ("GET", "/10"), ("POST", "/"), ("PUT", "/10"), ("DELETE", "/10"), ("POST", "/10/status"),
    ("POST", "/10/escalate"), ("POST", "/10/assign"), ("GET", "/duplicates"), ("GET", "/10/summary"),
    ("PUT", "/10/feedback"), ("GET", "/10/feedback"), ("GET", "/engineers/4/feedback"),
    ("GET", "/10/notes"), ("POST", "/10/notes"), ("PUT", "/10/notes/1"), ("DELETE", "/10/notes/1"),
    ("GET", "/10/events"), ("GET", "/engineers"),
])
def test_every_route_needs_a_token(repo, method, path):
    assert call(method, path)[0] == 401


@pytest.mark.parametrize("user", [EVE, FRED, PAT])
def test_delete_is_admin_only(repo, user):
    assert call("DELETE", "/10", user)[0] == 403


def test_admin_deletes_an_incident(repo):
    repo["incidents"][10] = incident()
    assert call("DELETE", "/10", ADMIN)[0] == 204
    assert 10 not in repo["incidents"]


def test_deleting_an_unknown_incident_is_404(repo):
    assert call("DELETE", "/10", ADMIN)[0] == 404


# --- list scope -----------------------------------------------------------------

@pytest.mark.parametrize("user,visible", [
    (ADMIN, None),
    (EVE, {"reporter_id": 2, "assignee_id": 2}),
    (FRED, {"reporter_id": 4, "assignee_id": 4, "team_id": 1}),
    (MORGAN, {"reporter_id": 7, "assignee_id": 7, "team_id": 2}),
])
def test_list_is_scoped_to_the_role(repo, user, visible):
    assert call("GET", "/", user)[0] == 200
    assert repo["list_calls"] == [(visible, None, {})]


def test_list_mine_narrows_to_reported_or_assigned(repo):
    call("GET", "/", FRED, query={"mine": "true"})
    assert repo["list_calls"] == [({"reporter_id": 4, "assignee_id": 4, "team_id": 1}, 4, {})]


def test_list_ignores_user_id_from_the_query(repo):
    call("GET", "/", EVE, query={"user_id": "1"})
    assert repo["list_calls"][0][0] == {"reporter_id": 2, "assignee_id": 2}


def test_list_rejects_a_bad_mine_value(repo):
    status, body = call("GET", "/", EVE, query={"mine": "yes"})
    assert status == 400
    assert "mine" in body["error"]["details"]


def test_list_filters_are_parsed_and_passed_on(repo):
    query = {"status": "open", "priority": "high", "category_id": "4", "building_id": "2",
             "assignee_id": "none", "escalated": "true", "q": "  wi-fi  "}
    assert call("GET", "/", ADMIN, query=query)[0] == 200
    assert repo["list_calls"][0][2] == {"status": "open", "priority": "high", "category_id": 4, "building_id": 2,
                                        "assignee_id": None, "is_escalated": True, "q": "wi-fi"}


def test_blank_filters_are_ignored(repo):
    call("GET", "/", ADMIN, query={"status": "", "q": "   ", "assignee_id": ""})
    assert repo["list_calls"][0][2] == {}


def test_bad_filters_name_each_field(repo):
    query = {"status": "done", "priority": "urgent", "category_id": "0", "building_id": "x",
             "assignee_id": "-1", "escalated": "yes", "q": "x" * 101}
    status, body = call("GET", "/", ADMIN, query=query)
    assert status == 400
    assert set(body["error"]["details"]) == set(query)
    assert repo["list_calls"] == []


# --- detail ---------------------------------------------------------------------

def test_detail_for_someone_in_scope(repo):
    repo["incidents"][10] = incident()
    assert call("GET", "/10", EVE) == (200, repo["incidents"][10])


@pytest.mark.parametrize("user", [SAM, TINA], ids=["other employee", "other-team engineer"])
def test_detail_out_of_scope_is_404(repo, user):
    repo["incidents"][10] = incident()
    assert call("GET", "/10", user)[0] == 404


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


# Users who can see the incident but may not make the move: the reporter never moves status,
# and an engineer on the team who isn't assigned can't either.
NOT_ALLOWED = [(move, EVE) for move in service.TRANSITIONS] + [
    (("in_progress", "resolved"), FRED_TEAMMATE), (("open", "closed"), FRED_TEAMMATE),
]


@pytest.mark.parametrize("move,user", NOT_ALLOWED,
                         ids=[f"{a}->{b} by {u['role']} {u['id']}" for (a, b), u in NOT_ALLOWED])
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


# --- edit -----------------------------------------------------------------------

def edit_target(repo, **fields):
    """An incident #10 with the fields edits compare against."""
    repo["incidents"][10] = incident(title="Old", description=None, priority="medium", category_id=1,
                                     building_id=1, floor_id=1, seat_id=1, assigned_at=None, **fields)
    return repo["incidents"][10]


@pytest.mark.parametrize("user", [EVE, PAT, ADMIN], ids=["reporter while open", "team manager", "admin"])
def test_who_may_edit(repo, user):
    edit_target(repo)
    status, body = call("PUT", "/10", user, {"title": "  New title "})
    assert status == 200, body
    assert repo["incidents"][10]["title"] == "New title"


@pytest.mark.parametrize("user,status_,expected", [
    (EVE, "in_progress", 403),      # reporter, but no longer open
    (FRED, "open", 403),            # assignee may not edit details
    (FRED_TEAMMATE, "open", 403),   # teammate
    (SAM, "open", 404),             # out of scope
    (TINA, "open", 404),
])
def test_who_may_not_edit(repo, user, status_, expected):
    edit_target(repo, status=status_)
    assert call("PUT", "/10", user, {"title": "New"})[0] == expected
    assert repo["updates"] == []


def test_closed_incident_cannot_be_edited(repo):
    edit_target(repo, status="closed")
    assert call("PUT", "/10", ADMIN, {"title": "New"})[0] == 409


def test_edit_needs_at_least_one_field(repo):
    edit_target(repo)
    assert call("PUT", "/10", ADMIN, {})[0] == 400


def test_edit_validates_only_the_fields_sent(repo):
    edit_target(repo)
    status, body = call("PUT", "/10", ADMIN, {"title": " ", "priority": None, "floor_id": "2"})
    assert status == 400
    assert set(body["error"]["details"]) == {"title", "priority", "floor_id"}


def test_edit_writes_only_what_changed(repo):
    edit_target(repo)
    call("PUT", "/10", ADMIN, {"title": "Old", "priority": "medium"})
    assert repo["updates"] == []
    assert repo["events"] == []


def test_priority_change_is_recorded(repo):
    edit_target(repo)
    call("PUT", "/10", PAT, {"priority": "critical"})
    assert repo["updates"][0]["priority"] == "critical"
    assert [(e["type"], e["from"], e["to"]) for e in repo["events"]] == [("priority_changed", "medium", "critical")]


def test_moving_building_clears_floor_and_seat(repo):
    edit_target(repo)
    call("PUT", "/10", ADMIN, {"building_id": 2})
    update = repo["updates"][0]
    assert (update["building_id"], update["floor_id"], update["seat_id"]) == (2, None, None)


def test_moving_floor_clears_only_the_seat(repo):
    edit_target(repo)
    call("PUT", "/10", ADMIN, {"floor_id": 2})
    assert "building_id" not in repo["updates"][0]
    assert (repo["updates"][0]["floor_id"], repo["updates"][0]["seat_id"]) == (2, None)


def test_category_of_another_team_moves_and_unassigns(repo):
    edit_target(repo)["assigned_at"] = "2026-11-18T09:00:00Z"
    status, _ = call("PUT", "/10", PAT, {"category_id": 4})
    assert status == 200
    update = repo["updates"][0]
    assert (update["team_id"], update["assignee_id"], update["assigned_at"]) == (2, None, None)
    assert [(e["type"], e["from"], e["to"]) for e in repo["events"]] == [
        ("team_changed", "1", "2"), ("assigned", "4", None)]


def test_only_open_incidents_change_team(repo):
    edit_target(repo, status="in_progress")
    assert call("PUT", "/10", ADMIN, {"category_id": 4})[0] == 409


def test_unknown_category_on_edit_is_a_field_error(repo):
    edit_target(repo)
    status, body = call("PUT", "/10", ADMIN, {"category_id": 777})
    assert status == 400
    assert "category_id" in body["error"]["details"]


# --- possible duplicates ----------------------------------------------------------

def test_duplicates_for_a_place_and_category(repo):
    status, body = call("GET", "/duplicates", SAM, query={"category_id": "1", "building_id": "1", "floor_id": "1"})
    assert status == 200
    assert body == [{"id": 1, "title": "Air con not working"}]
    assert repo["duplicate_calls"] == [(1, 1, 1, service.MAX_DUPLICATES)]


def test_duplicates_without_a_floor_match_no_floor(repo):
    call("GET", "/duplicates", SAM, query={"category_id": "1", "building_id": "1", "floor_id": ""})
    assert repo["duplicate_calls"][0][2] is None


def test_duplicates_need_category_and_building(repo):
    status, body = call("GET", "/duplicates", SAM, query={"floor_id": "x"})
    assert status == 400
    assert set(body["error"]["details"]) == {"category_id", "building_id", "floor_id"}


def test_summary_only_for_a_matching_duplicate(repo):
    match = {"category_id": "1", "building_id": "1", "floor_id": "1"}
    assert call("GET", "/1/summary", SAM, query=match)[0] == 200
    assert call("GET", "/1/summary", SAM, query={**match, "category_id": "2"})[0] == 404


# --- reporter feedback (private from the engineer) ----------------------------------

def given_feedback(repo, rating=4, status="resolved"):
    """Incident #10 (Facilities, reported by Eve, completed by Fred) with Eve's feedback on it."""
    repo["incidents"][10] = incident(status=status)
    repo["feedback"][10] = {"incident_id": 10, "reporter_id": EVE["id"], "engineer_id": FRED["id"],
                            "rating": rating, "comment": "Quick fix"}


@pytest.mark.parametrize("status_", ["resolved", "closed"])
def test_reporter_gives_feedback_on_completed_work(repo, status_):
    repo["incidents"][10] = incident(status=status_)
    status, body = call("PUT", "/10/feedback", EVE, {"rating": 5, "comment": "  Great  "})
    assert status == 200
    assert (body["rating"], body["comment"], body["engineer_id"]) == (5, "Great", FRED["id"])
    assert repo["events"] == []  # the engineer can read events, so feedback writes none


def test_reporter_can_change_feedback_until_closed(repo):
    given_feedback(repo)
    assert call("PUT", "/10/feedback", EVE, {"rating": 2})[0] == 200
    assert repo["feedback"][10]["rating"] == 2
    repo["incidents"][10]["status"] = "closed"
    assert call("PUT", "/10/feedback", EVE, {"rating": 5})[0] == 409
    assert repo["feedback"][10]["rating"] == 2


@pytest.mark.parametrize("status_", ["open", "in_progress", "blocked"])
def test_no_feedback_before_the_work_is_done(repo, status_):
    repo["incidents"][10] = incident(status=status_)
    assert call("PUT", "/10/feedback", EVE, {"rating": 5})[0] == 409


def test_no_feedback_without_an_engineer(repo):
    repo["incidents"][10] = incident(status="closed", assignee_id=None)
    assert call("PUT", "/10/feedback", EVE, {"rating": 5})[0] == 409


def test_no_feedback_on_your_own_work(repo):
    repo["incidents"][10] = incident(status="resolved", reporter_id=FRED["id"], assignee_id=FRED["id"])
    assert call("PUT", "/10/feedback", FRED, {"rating": 5})[0] == 409


@pytest.mark.parametrize("user,expected", [(FRED, 403), (PAT, 403), (ADMIN, 403), (SAM, 404)],
                         ids=["engineer", "manager", "admin", "out of scope"])
def test_only_the_reporter_gives_feedback(repo, user, expected):
    repo["incidents"][10] = incident(status="resolved")
    assert call("PUT", "/10/feedback", user, {"rating": 5})[0] == expected
    assert repo["feedback"] == {}


@pytest.mark.parametrize("body", [{}, {"rating": 0}, {"rating": 6}, {"rating": 4.5}, {"rating": "5"}, {"rating": True}])
def test_rating_is_a_whole_number_from_1_to_5(repo, body):
    repo["incidents"][10] = incident(status="resolved")
    status, error = call("PUT", "/10/feedback", EVE, body)
    assert status == 400
    assert "rating" in error["error"]["details"]


def test_comment_length_is_limited(repo):
    repo["incidents"][10] = incident(status="resolved")
    status, error = call("PUT", "/10/feedback", EVE, {"rating": 3, "comment": "x" * (service.MAX_COMMENT + 1)})
    assert status == 400
    assert "comment" in error["error"]["details"]


@pytest.mark.parametrize("user", [EVE, PAT, ADMIN], ids=["reporter", "engineer's manager", "admin"])
def test_who_reads_feedback(repo, user):
    given_feedback(repo)
    status, body = call("GET", "/10/feedback", user)
    assert status == 200
    assert body["rating"] == 4


@pytest.mark.parametrize("user,expected", [(FRED, 403), (FRED_TEAMMATE, 403), (MORGAN, 404), (SAM, 404)],
                         ids=["the engineer", "teammate", "other-team manager", "out of scope"])
def test_feedback_is_hidden_from_everyone_else(repo, user, expected):
    given_feedback(repo)
    status, body = call("GET", "/10/feedback", user)
    assert status == expected
    assert "Quick fix" not in json.dumps(body)


def test_no_feedback_yet_is_null(repo):
    repo["incidents"][10] = incident(status="resolved")
    assert call("GET", "/10/feedback", EVE) == (200, None)


def test_incident_detail_never_includes_feedback(repo):
    given_feedback(repo)
    assert "Quick fix" not in json.dumps(call("GET", "/10", FRED)[1])


def test_engineer_feedback_for_their_manager(repo):
    given_feedback(repo, rating=4)
    repo["feedback"][11] = {"incident_id": 11, "reporter_id": SAM["id"], "engineer_id": FRED["id"],
                            "rating": 5, "comment": None}
    status, body = call("GET", f"/engineers/{FRED['id']}/feedback", PAT)
    assert status == 200
    assert (body["engineer"]["id"], body["count"], body["average_rating"]) == (FRED["id"], 2, 4.5)


def test_engineer_without_feedback_has_no_average(repo):
    status, body = call("GET", f"/engineers/{TINA['id']}/feedback", ADMIN)
    assert status == 200
    assert (body["count"], body["average_rating"], body["feedback"]) == (0, None, [])


@pytest.mark.parametrize("user,engineer_id,expected", [
    (FRED, FRED["id"], 403),        # engineers can't read their own feedback (route roles)
    (EVE, FRED["id"], 403),
    (MORGAN, FRED["id"], 404),      # manager of another team
    (ADMIN, MORGAN["id"], 404),     # not an engineer
    (ADMIN, 999, 404),
])
def test_engineer_feedback_is_restricted(repo, user, engineer_id, expected):
    assert call("GET", f"/engineers/{engineer_id}/feedback", user)[0] == expected


# --- assign ---------------------------------------------------------------------

def unassigned(repo, **fields):
    """An open, unassigned Facilities incident #10 reported by Eve."""
    repo["incidents"][10] = incident(assignee_id=None, assigned_at=None, is_escalated=False, **fields)
    return repo["incidents"][10]


@pytest.mark.parametrize("user", [PAT, ADMIN], ids=["team manager", "admin"])
def test_manager_or_admin_assigns_a_team_engineer(repo, user):
    unassigned(repo)
    status, _ = call("POST", "/10/assign", user, {"assignee_id": FRED_TEAMMATE["id"]})
    assert status == 200
    assert repo["incidents"][10]["assignee_id"] == FRED_TEAMMATE["id"]
    assert repo["incidents"][10]["assigned_at"] is not None
    assert repo["incidents"][10]["acknowledged_at"] is None  # only the engineer taking it acknowledges it
    assert [(e["type"], e["from"], e["to"]) for e in repo["events"]] == [("assigned", None, "9")]


def test_engineer_takes_an_unassigned_team_ticket(repo):
    unassigned(repo)
    assert call("POST", "/10/assign", FRED, {"assignee_id": FRED["id"]})[0] == 200
    assert repo["incidents"][10]["assignee_id"] == FRED["id"]
    assert repo["incidents"][10]["acknowledged_at"] is not None


@pytest.mark.parametrize("user,body,expected", [
    (FRED, {"assignee_id": FRED_TEAMMATE["id"]}, 403),   # an engineer can't assign someone else
    (FRED, {"assignee_id": None}, 403),
    (TINA, {"assignee_id": TINA["id"]}, 404),            # other team's ticket
    (EVE, {"assignee_id": FRED["id"]}, 403),             # employees: route roles
    (MORGAN, {"assignee_id": FRED["id"]}, 404),          # other team's manager
])
def test_who_may_not_assign(repo, user, body, expected):
    unassigned(repo)
    assert call("POST", "/10/assign", user, body)[0] == expected
    assert repo["events"] == []


def test_engineer_cannot_take_an_assigned_ticket(repo):
    unassigned(repo)["assignee_id"] = FRED_TEAMMATE["id"]
    assert call("POST", "/10/assign", FRED, {"assignee_id": FRED["id"]})[0] == 409


@pytest.mark.parametrize("change", [
    {"role": "employee"}, {"team_id": 2}, {"is_active": False}, {"is_available": False},
], ids=["not an engineer", "other team", "inactive", "unavailable"])
def test_assignee_must_be_an_available_team_engineer(repo, change):
    unassigned(repo)
    repo["users"][FRED_TEAMMATE["id"]].update(change)
    status, body = call("POST", "/10/assign", PAT, {"assignee_id": FRED_TEAMMATE["id"]})
    assert status == 400
    assert "assignee_id" in body["error"]["details"]


@pytest.mark.parametrize("value", ["4", 0, True, 1.5])
def test_assignee_id_must_be_an_id_or_null(repo, value):
    unassigned(repo)
    assert call("POST", "/10/assign", PAT, {"assignee_id": value})[0] == 400


def test_unknown_assignee_is_a_field_error(repo):
    unassigned(repo)
    assert call("POST", "/10/assign", PAT, {"assignee_id": 999})[0] == 400


@pytest.mark.parametrize("status_", ["resolved", "closed"])
def test_finished_incidents_cannot_be_reassigned(repo, status_):
    repo["incidents"][10] = incident(status=status_)
    assert call("POST", "/10/assign", PAT, {"assignee_id": FRED_TEAMMATE["id"]})[0] == 409


def test_unassign_only_while_open(repo):
    repo["incidents"][10] = incident(status="open")
    assert call("POST", "/10/assign", PAT, {"assignee_id": None})[0] == 200
    assert repo["incidents"][10]["assignee_id"] is None
    assert repo["events"][-1]["from"] == "4"
    repo["incidents"][10].update(status="in_progress", assignee_id=FRED["id"])
    assert call("POST", "/10/assign", PAT, {"assignee_id": None})[0] == 409


def test_reassigning_to_the_same_engineer_changes_nothing(repo):
    repo["incidents"][10] = incident()
    assert call("POST", "/10/assign", PAT, {"assignee_id": FRED["id"]})[0] == 200
    assert repo["updates"] == [] and repo["events"] == []


# --- escalate -------------------------------------------------------------------

@pytest.mark.parametrize("user", [EVE, FRED, PAT, ADMIN], ids=["reporter", "assignee", "team manager", "admin"])
def test_who_may_escalate(repo, user):
    repo["incidents"][10] = incident(is_escalated=False)
    status, _ = call("POST", "/10/escalate", user, {"escalate": True, "reason": " Whole floor affected "})
    assert status == 200
    assert repo["incidents"][10]["is_escalated"] is True
    assert repo["incidents"][10]["escalation_reason"] == "Whole floor affected"
    assert [(e["type"], e["from"], e["to"], e["reason"]) for e in repo["events"]] == [
        ("escalated", "false", "true", "Whole floor affected")]


def test_teammate_cannot_escalate(repo):
    repo["incidents"][10] = incident(is_escalated=False)
    assert call("POST", "/10/escalate", FRED_TEAMMATE, {"escalate": True, "reason": "x"})[0] == 403


@pytest.mark.parametrize("user,expected", [(PAT, 200), (ADMIN, 200), (EVE, 403), (FRED, 403)])
def test_only_manager_or_admin_clears(repo, user, expected):
    repo["incidents"][10] = incident(is_escalated=True, escalation_reason="Urgent")
    assert call("POST", "/10/escalate", user, {"escalate": False})[0] == expected
    if expected == 200:
        assert (repo["incidents"][10]["is_escalated"], repo["incidents"][10]["escalation_reason"]) == (False, None)
        assert (repo["events"][-1]["from"], repo["events"][-1]["to"]) == ("true", "false")


@pytest.mark.parametrize("body,field", [
    ({"escalate": True}, "reason"), ({"escalate": True, "reason": "  "}, "reason"),
    ({"reason": "x"}, "escalate"), ({"escalate": "yes", "reason": "x"}, "escalate"),
])
def test_escalation_validation(repo, body, field):
    repo["incidents"][10] = incident(is_escalated=False)
    status, error = call("POST", "/10/escalate", EVE, body)
    assert status == 400
    assert field in error["error"]["details"]


def test_escalating_twice_or_clearing_nothing_is_409(repo):
    repo["incidents"][10] = incident(is_escalated=True, escalation_reason="Urgent")
    assert call("POST", "/10/escalate", EVE, {"escalate": True, "reason": "again"})[0] == 409
    repo["incidents"][10]["is_escalated"] = False
    assert call("POST", "/10/escalate", PAT, {"escalate": False})[0] == 409


@pytest.mark.parametrize("status_", ["resolved", "closed"])
def test_finished_incidents_cannot_be_escalated(repo, status_):
    repo["incidents"][10] = incident(status=status_, is_escalated=False)
    assert call("POST", "/10/escalate", EVE, {"escalate": True, "reason": "x"})[0] == 409


# --- notes ----------------------------------------------------------------------

def with_note(repo, author=EVE, status="in_progress"):
    """Incident #10 (Facilities, reported by Eve, assigned to Fred) with one note, id 1."""
    repo["incidents"][10] = incident(status=status)
    repo["notes"][1] = {"id": 1, "incident_id": 10, "author_id": author["id"], "body": "First"}


@pytest.mark.parametrize("user", [EVE, FRED, FRED_TEAMMATE, PAT, ADMIN])
def test_anyone_in_scope_adds_and_reads_notes(repo, user):
    repo["incidents"][10] = incident()
    status, note = call("POST", "/10/notes", user, {"body": "  Any update?  "})
    assert status == 201
    assert (note["body"], note["author_id"]) == ("Any update?", user["id"])
    assert call("GET", "/10/notes", user) == (200, [note])


@pytest.mark.parametrize("user", [SAM, TINA, MORGAN])
def test_notes_out_of_scope_are_404(repo, user):
    with_note(repo)
    assert call("GET", "/10/notes", user)[0] == 404
    assert call("POST", "/10/notes", user, {"body": "x"})[0] == 404


@pytest.mark.parametrize("body", [{}, {"body": "   "}, {"body": 5}, {"body": "x" * (service.MAX_NOTE + 1)}])
def test_note_text_is_required_and_limited(repo, body):
    repo["incidents"][10] = incident()
    status, error = call("POST", "/10/notes", EVE, body)
    assert status == 400
    assert "body" in error["error"]["details"]


def test_no_notes_on_a_closed_incident(repo):
    repo["incidents"][10] = incident(status="closed")
    assert call("POST", "/10/notes", EVE, {"body": "x"})[0] == 409


@pytest.mark.parametrize("user,acknowledges", [(FRED, True), (FRED_TEAMMATE, True), (PAT, True), (EVE, False),
                                               (ADMIN, False)])
def test_first_note_from_the_team_acknowledges(repo, user, acknowledges):
    repo["incidents"][10] = incident()
    call("POST", "/10/notes", user, {"body": "Looking at it"})
    assert (repo["incidents"][10]["acknowledged_at"] is not None) == acknowledges


def test_a_later_note_keeps_the_first_acknowledgement(repo):
    repo["incidents"][10] = incident(acknowledged_at="earlier")
    call("POST", "/10/notes", FRED, {"body": "Still on it"})
    assert repo["incidents"][10]["acknowledged_at"] == "earlier"


def test_author_edits_their_note(repo):
    with_note(repo)
    status, note = call("PUT", "/10/notes/1", EVE, {"body": "Edited"})
    assert (status, note["body"]) == (200, "Edited")


@pytest.mark.parametrize("user", [FRED, PAT, ADMIN])
def test_only_the_author_edits(repo, user):
    with_note(repo)
    assert call("PUT", "/10/notes/1", user, {"body": "Edited"})[0] == 403
    assert repo["notes"][1]["body"] == "First"


def test_note_must_belong_to_the_incident(repo):
    with_note(repo)
    repo["incidents"][11] = incident(status="open", id=11)
    assert call("PUT", "/11/notes/1", EVE, {"body": "x"})[0] == 404
    assert call("DELETE", "/11/notes/1", ADMIN)[0] == 404


@pytest.mark.parametrize("user", [EVE, ADMIN], ids=["author", "admin"])
def test_author_or_admin_deletes_a_note(repo, user):
    with_note(repo)
    assert call("DELETE", "/10/notes/1", user)[0] == 204
    assert repo["notes"] == {}


@pytest.mark.parametrize("user", [FRED, PAT])
def test_others_cannot_delete_a_note(repo, user):
    with_note(repo)
    assert call("DELETE", "/10/notes/1", user)[0] == 403
    assert 1 in repo["notes"]


def test_notes_are_frozen_once_closed_except_for_admin(repo):
    with_note(repo, status="closed")
    assert call("PUT", "/10/notes/1", EVE, {"body": "x"})[0] == 409
    assert call("DELETE", "/10/notes/1", EVE)[0] == 409
    assert call("DELETE", "/10/notes/1", ADMIN)[0] == 204


# --- events ---------------------------------------------------------------------

def test_events_for_anyone_in_scope(repo):
    repo["incidents"][10] = incident()
    repo["events"].append({"incident_id": 10, "type": "created"})
    assert call("GET", "/10/events", FRED) == (200, [{"incident_id": 10, "type": "created"}])
    assert call("GET", "/10/events", SAM)[0] == 404


# --- engineers (assign dropdown) ------------------------------------------------------

def test_manager_lists_their_own_team(repo):
    assert call("GET", "/engineers", PAT) == (200, [{"id": 4, "name": "Fred Facilities", "team_id": 1}])
    assert call("GET", "/engineers", PAT, query={"team_id": "1"})[0] == 200
    assert repo["engineer_calls"] == [1, 1]


def test_manager_cannot_list_another_team(repo):
    assert call("GET", "/engineers", PAT, query={"team_id": "2"})[0] == 404
    assert repo["engineer_calls"] == []


@pytest.mark.parametrize("query,team_id", [(None, None), ({"team_id": "2"}, 2), ({"team_id": ""}, None)])
def test_admin_lists_everyone_or_one_team(repo, query, team_id):
    assert call("GET", "/engineers", ADMIN, query=query)[0] == 200
    assert repo["engineer_calls"] == [team_id]


@pytest.mark.parametrize("user", [EVE, FRED], ids=["employee", "engineer"])
def test_only_managers_and_admins_list_engineers(repo, user):
    assert call("GET", "/engineers", user)[0] == 403


@pytest.mark.parametrize("value", ["x", "0", "-1"])
def test_bad_team_id_is_400(repo, value):
    assert call("GET", "/engineers", ADMIN, query={"team_id": value})[0] == 400
