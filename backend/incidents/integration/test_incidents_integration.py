"""
Incidents against a real database: create, scoped lists, filters, the full workflow with its timestamps and
audit trail, notes, escalation, feedback, duplicates and delete. Each test creates its own incidents, so the
tests don't depend on each other; seeded data is only read.

Seeded people: eve (employee), tina (engineer, Workplace Technology), fred (engineer, Facilities),
morgan (manager, Workplace Technology), pat (manager, Facilities), admin.
"""

import pytest
from integration_support import query

IT_HARDWARE = 4  # category routed to team 2, Workplace Technology
HQ, HQ_FLOOR_1, SEAT_1_01 = 1, 2, 3
RIVERSIDE_GROUND = 3  # a floor in Riverside Annex, not HQ


@pytest.fixture
def report(api):
    """Report an IT hardware incident at HQ Floor 1 as eve; returns the created incident."""
    def make(title="Docking station dead", **extra):
        status, body = api("POST", "/", as_user="eve@acme.inc", body={
            "title": title, "description": "No screens", "category_id": IT_HARDWARE,
            "building_id": HQ, "floor_id": HQ_FLOOR_1, "seat_id": SEAT_1_01, **extra})
        assert status == 201, body
        return body
    return make


def events_of(incident_id):
    return [(e["event_type"], e["from_value"], e["to_value"])
            for e in query("SELECT * FROM incident_events WHERE incident_id = %s ORDER BY id", (incident_id,))]


# --- create and read --------------------------------------------------------------------

def test_reporting_routes_to_the_category_team_and_records_who(api, report):
    incident = report(priority="high")
    row = query("SELECT * FROM incidents WHERE id = %s", (incident["id"],))[0]
    assert (row["team_id"], row["reporter_id"], row["status"], row["priority"]) == (2, 2, "open", "high")
    assert events_of(incident["id"]) == [("created", None, "open")]
    assert api("GET", f"/{incident['id']}", as_user="eve@acme.inc")[1]["title"] == "Docking station dead"


def test_a_floor_from_another_building_is_rejected_by_the_database_rule(api):
    before = query("SELECT count(*) AS n FROM incidents")[0]["n"]
    status, body = api("POST", "/", as_user="eve@acme.inc", body={
        "title": "Wrong place", "category_id": IT_HARDWARE, "building_id": HQ, "floor_id": RIVERSIDE_GROUND})
    assert status == 400
    assert "floor_id" in body["error"]["details"]
    assert query("SELECT count(*) AS n FROM incidents")[0]["n"] == before


# --- who sees what ----------------------------------------------------------------------

def test_each_role_sees_only_its_incidents(api):
    admin = api("GET", "/", as_user="admin@acme.inc")[1]
    assert len(admin) == query("SELECT count(*) AS n FROM incidents")[0]["n"]

    eve = api("GET", "/", as_user="eve@acme.inc")[1]
    assert eve and all(i["reporter_id"] == 2 for i in eve)

    morgan = api("GET", "/", as_user="morgan@acme.inc")[1]
    assert morgan and {i["team_id"] for i in morgan} == {2}

    tina_sees = {i["id"] for i in api("GET", "/", as_user="tina@acme.inc")[1]}
    outside = query("""SELECT id FROM incidents
                       WHERE team_id = 1 AND reporter_id <> 5 AND assignee_id IS DISTINCT FROM 5""")
    assert not tina_sees & {r["id"] for r in outside}


def test_an_incident_outside_your_scope_is_404(api, report):
    incident = report()
    assert api("GET", f"/{incident['id']}", as_user="fred@acme.inc")[0] == 404  # other team's engineer
    assert api("GET", f"/{incident['id']}", as_user="sam@acme.inc")[0] == 404  # another employee


def test_filters_and_search_run_in_sql(api, report):
    report(title="Projector humming loudly")
    found = api("GET", "/", as_user="admin@acme.inc", query_params={"q": "humming"})[1]
    assert [i["title"] for i in found] == ["Projector humming loudly"]

    blocked = api("GET", "/", as_user="admin@acme.inc", query_params={"status": "blocked"})[1]
    assert len(blocked) == query("SELECT count(*) AS n FROM incidents WHERE status = 'blocked'")[0]["n"]
    assert all(i["status"] == "blocked" for i in blocked)

    assert api("GET", "/", as_user="admin@acme.inc", query_params={"status": "nonsense"})[0] == 400


# --- the workflow -----------------------------------------------------------------------

def test_full_workflow_sets_each_timestamp_and_writes_the_audit_trail(api, report):
    incident_id = report()["id"]
    path = f"/{incident_id}"

    # assigning outside the incident's team is refused
    assert api("POST", f"{path}/assign", as_user="morgan@acme.inc", body={"assignee_id": 4})[0] == 400
    assert api("POST", f"{path}/assign", as_user="morgan@acme.inc", body={"assignee_id": 5})[0] == 200
    assert api("POST", f"{path}/status", as_user="tina@acme.inc", body={"status": "in_progress"})[0] == 200
    assert api("POST", f"{path}/status", as_user="tina@acme.inc",
               body={"status": "blocked", "reason": "Waiting on a part"})[0] == 200
    assert query("SELECT blocked_reason FROM incidents WHERE id = %s", (incident_id,))[0]["blocked_reason"] == (
        "Waiting on a part")
    assert api("POST", f"{path}/status", as_user="tina@acme.inc", body={"status": "in_progress"})[0] == 200
    assert api("POST", f"{path}/status", as_user="tina@acme.inc", body={"status": "resolved"})[0] == 200
    assert api("POST", f"{path}/status", as_user="morgan@acme.inc", body={"status": "closed"})[0] == 200

    row = query("SELECT * FROM incidents WHERE id = %s", (incident_id,))[0]
    assert (row["status"], row["assignee_id"], row["blocked_reason"]) == ("closed", 5, None)
    assert row["created_at"] <= row["assigned_at"] <= row["acknowledged_at"] <= row["resolved_at"] <= row["closed_at"]
    assert events_of(incident_id) == [
        ("created", None, "open"),
        ("assigned", None, "5"),
        ("status_changed", "open", "in_progress"),
        ("status_changed", "in_progress", "blocked"),
        ("status_changed", "blocked", "in_progress"),
        ("status_changed", "in_progress", "resolved"),
        ("status_changed", "resolved", "closed"),
    ]
    assert len(api("GET", f"{path}/events", as_user="eve@acme.inc")[1]) == 7


def test_invalid_moves_change_nothing(api, report):
    incident_id = report()["id"]
    assert api("POST", f"/{incident_id}/status", as_user="admin@acme.inc", body={"status": "resolved"})[0] == 409
    assert api("POST", f"/{incident_id}/status", as_user="admin@acme.inc", body={"status": "in_progress"})[0] == 409
    assert query("SELECT status FROM incidents WHERE id = %s", (incident_id,))[0]["status"] == "open"
    assert events_of(incident_id) == [("created", None, "open")]


def test_editing_into_another_teams_category_moves_and_unassigns_it(api, report):
    incident_id = report()["id"]
    api("POST", f"/{incident_id}/assign", as_user="admin@acme.inc", body={"assignee_id": 5})
    status, body = api("PUT", f"/{incident_id}", as_user="admin@acme.inc", body={"category_id": 1})  # HVAC
    assert status == 200
    row = query("SELECT team_id, assignee_id FROM incidents WHERE id = %s", (incident_id,))[0]
    assert (row["team_id"], row["assignee_id"]) == (1, None)


# --- notes, escalation, feedback --------------------------------------------------------

def test_notes_are_shared_between_reporter_and_engineer(api, report):
    incident_id = report()["id"]
    api("POST", f"/{incident_id}/assign", as_user="morgan@acme.inc", body={"assignee_id": 5})
    assert api("POST", f"/{incident_id}/notes", as_user="eve@acme.inc", body={"body": "It's urgent"})[0] == 201
    assert api("POST", f"/{incident_id}/notes", as_user="tina@acme.inc", body={"body": "On my way"})[0] == 201
    notes = api("GET", f"/{incident_id}/notes", as_user="tina@acme.inc")[1]
    assert [n["body"] for n in notes] == ["It's urgent", "On my way"]
    # the engineer's first note acknowledges the incident
    assert query("SELECT acknowledged_at FROM incidents WHERE id = %s", (incident_id,))[0]["acknowledged_at"]


def test_escalation_is_requested_then_cleared(api, report):
    incident_id = report()["id"]
    assert api("POST", f"/{incident_id}/escalate", as_user="eve@acme.inc",
               body={"escalate": True, "reason": "Client demo at 3pm"})[0] == 200
    row = query("SELECT is_escalated, escalation_reason FROM incidents WHERE id = %s", (incident_id,))[0]
    assert row == {"is_escalated": True, "escalation_reason": "Client demo at 3pm"}
    assert api("POST", f"/{incident_id}/escalate", as_user="eve@acme.inc", body={"escalate": False})[0] == 403
    assert api("POST", f"/{incident_id}/escalate", as_user="morgan@acme.inc", body={"escalate": False})[0] == 200
    assert events_of(incident_id)[-2:] == [("escalated", "false", "true"), ("escalated", "true", "false")]


def test_feedback_on_completed_work_reaches_the_manager(api, report):
    incident_id = report()["id"]
    api("POST", f"/{incident_id}/assign", as_user="morgan@acme.inc", body={"assignee_id": 5})
    api("POST", f"/{incident_id}/status", as_user="tina@acme.inc", body={"status": "in_progress"})
    assert api("PUT", f"/{incident_id}/feedback", as_user="eve@acme.inc", body={"rating": 4})[0] == 409  # not done
    api("POST", f"/{incident_id}/status", as_user="tina@acme.inc", body={"status": "resolved"})

    assert api("PUT", f"/{incident_id}/feedback", as_user="eve@acme.inc",
               body={"rating": 5, "comment": "Quick fix"})[0] == 200
    stored = query("SELECT engineer_id, rating FROM incident_feedback WHERE incident_id = %s", (incident_id,))[0]
    assert stored == {"engineer_id": 5, "rating": 5}
    manager_view = api("GET", "/engineers/5/feedback", as_user="morgan@acme.inc")[1]
    assert any(f["incident_id"] == incident_id for f in manager_view["feedback"])


# --- duplicates, engineers, delete ------------------------------------------------------

def test_a_second_report_at_the_same_place_finds_the_first(api, report):
    first = report(title="Screen dead at 1-01")
    matches = api("GET", "/duplicates", as_user="sam@acme.inc", query_params={
        "category_id": str(IT_HARDWARE), "building_id": str(HQ), "floor_id": str(HQ_FLOOR_1)})[1]
    assert first["id"] in [m["id"] for m in matches]


def test_the_assign_list_is_the_teams_active_engineers(api):
    names = [e["name"] for e in api("GET", "/engineers", as_user="morgan@acme.inc")[1]]
    expected = query("SELECT name FROM users WHERE role = 'engineer' AND team_id = 2 AND is_active ORDER BY name")
    assert names == [r["name"] for r in expected]


def test_admin_delete_removes_notes_and_history_too(api, report):
    incident_id = report()["id"]
    api("POST", f"/{incident_id}/notes", as_user="eve@acme.inc", body={"body": "Please help"})
    assert api("DELETE", f"/{incident_id}", as_user="morgan@acme.inc")[0] == 403
    assert api("DELETE", f"/{incident_id}", as_user="admin@acme.inc")[0] == 204
    assert query("SELECT count(*) AS n FROM incident_notes WHERE incident_id = %s", (incident_id,))[0]["n"] == 0
    assert events_of(incident_id) == []
    assert api("GET", f"/{incident_id}", as_user="admin@acme.inc")[0] == 404
