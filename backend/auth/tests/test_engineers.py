"""
Unit tests for engineer profiles (GET/POST /engineers, PATCH /engineers/{id}): admin only, validation,
and the open-work guard. Repository and lookups are in-memory fakes; requests go through the real handler.
"""

import json

import pytest
from psycopg import errors as pg_errors

import function
import repository
from common import lookups
from common.auth import issue_token, verify_password

ADMIN = {"id": 1, "role": "admin", "team_id": None}
EVE = {"id": 2, "role": "employee", "team_id": None}
FRED = {"id": 4, "role": "engineer", "team_id": 1}
PAT = {"id": 8, "role": "manager", "team_id": 1}
TEAMS = {1: {"id": 1, "name": "Facilities"}, 2: {"id": 2, "name": "Workplace Technology"}}


def user(user_id, name, role, team_id=None, **extra):
    return {"id": user_id, "email": f"{name.split()[0].lower()}@acme.inc", "name": name, "role": role,
            "team_id": team_id, "team_name": TEAMS[team_id]["name"] if team_id else None,
            "is_available": True, "is_active": True, "created_at": "2026-01-01", **extra}


@pytest.fixture
def db(monkeypatch):
    """In-memory users and open-incident counts behind the repository and lookups."""
    users = {
        1: user(1, "Alex Admin", "admin"),
        2: user(2, "Eve Employee", "employee"),
        4: user(4, "Fred Facilities", "engineer", 1),
        5: user(5, "Tina Tech", "engineer", 2),
        8: user(8, "Pat Manager", "manager", 1),
    }
    state = {"users": users, "open": {5: 2}, "inserted": [], "updates": [], "listed": []}

    def insert_user(fields):
        if any(u["email"] == fields["email"] for u in users.values()):
            raise pg_errors.UniqueViolation("duplicate key")
        new_id = max(users) + 1
        users[new_id] = {**user(new_id, fields["name"], fields["role"], fields["team_id"]), **fields}
        state["inserted"].append(fields)
        return new_id

    def update_engineer(user_id, fields):
        state["updates"].append((user_id, fields))
        users[user_id].update(fields)

    def list_engineers(team_id=None, include_inactive=False):
        state["listed"].append((team_id, include_inactive))
        return [u for u in users.values() if u["role"] == "engineer" and team_id in (None, u["team_id"])]

    monkeypatch.setattr(repository, "insert_user", insert_user)
    monkeypatch.setattr(repository, "get_user",
                        lambda user_id: users.get(user_id) and {k: v for k, v in users[user_id].items()
                                                                if k != "password_hash"})
    monkeypatch.setattr(repository, "update_engineer", update_engineer)
    monkeypatch.setattr(lookups, "get_team", TEAMS.get)
    monkeypatch.setattr(lookups, "list_engineers", list_engineers)
    monkeypatch.setattr(lookups, "open_incidents", lambda user_id: state["open"].get(user_id, 0))
    return state


def call(method, path, who=None, body=None, query=None):
    """Call /api/auth<path> through the Lambda handler as `who`; returns (status, body)."""
    res = function.handler({
        "requestContext": {"http": {"method": method}},
        "rawPath": f"/api/auth{path}",
        "queryStringParameters": query,
        "headers": {"authorization": f"Bearer {issue_token(who)}"} if who else {},
        "body": json.dumps(body) if body is not None else None,
    })
    return res["statusCode"], json.loads(res.get("body") or "null")


NEW = {"name": " Nia New ", "email": "Nia.New@ACME.inc", "password": "Temporary123!", "team_id": 2}


# --- access ---------------------------------------------------------------------------

@pytest.mark.parametrize("who", [PAT, FRED, EVE], ids=["manager", "engineer", "employee"])
def test_only_the_facility_admin_manages_engineers(db, who):
    assert call("GET", "/engineers", who)[0] == 403
    assert call("POST", "/engineers", who, NEW)[0] == 403
    assert call("PATCH", "/engineers/5", who, {"name": "X"})[0] == 403
    assert db["inserted"] == [] and db["updates"] == []


def test_signing_in_is_required(db):
    assert call("GET", "/engineers")[0] == 401


# --- listing ----------------------------------------------------------------------------

def test_lists_every_engineer_including_deactivated(db):
    status, body = call("GET", "/engineers", ADMIN)
    assert status == 200
    assert [u["name"] for u in body] == ["Fred Facilities", "Tina Tech"]
    assert db["listed"] == [(None, True)]


def test_lists_one_team(db):
    assert [u["id"] for u in call("GET", "/engineers", ADMIN, query={"team_id": "2"})[1]] == [5]
    assert call("GET", "/engineers", ADMIN, query={"team_id": "abc"})[0] == 400


# --- creating ---------------------------------------------------------------------------

def test_creates_an_engineer_with_a_temporary_password(db):
    status, body = call("POST", "/engineers", ADMIN, NEW)
    assert status == 201
    assert (body["name"], body["email"]) == ("Nia New", "nia.new@acme.inc")
    assert (body["role"], body["team_id"]) == ("engineer", 2)
    assert "password_hash" not in body
    inserted = db["inserted"][0]
    assert inserted["created_by"] == ADMIN["id"]
    assert verify_password("Temporary123!", inserted["password_hash"])


def test_the_new_engineer_is_always_an_engineer(db):
    assert call("POST", "/engineers", ADMIN, {**NEW, "role": "admin"})[1]["role"] == "engineer"


def test_creating_validates_every_field(db):
    status, body = call("POST", "/engineers", ADMIN, {"name": "", "email": "nia@gmail.com", "password": "short",
                                                      "team_id": "2"})
    assert status == 400
    assert set(body["error"]["details"]) == {"name", "email", "password", "team_id"}


def test_the_team_must_exist(db):
    assert call("POST", "/engineers", ADMIN, {**NEW, "team_id": 9})[1]["error"]["details"] == {
        "team_id": "Team does not exist"}


def test_email_already_in_use_is_409(db):
    status, body = call("POST", "/engineers", ADMIN, {**NEW, "email": "tina@acme.inc"})
    assert status == 409
    assert body["error"]["details"] == {"email": "An account with this email already exists"}


# --- changing ---------------------------------------------------------------------------

def test_changes_name_and_availability(db):
    status, body = call("PATCH", "/engineers/4", ADMIN, {"name": " Fred F ", "is_available": False})
    assert status == 200
    assert (body["name"], body["is_available"]) == ("Fred F", False)
    assert db["updates"] == [(4, {"name": "Fred F", "is_available": False})]


@pytest.mark.parametrize("target", [1, 2, 8, 99], ids=["admin", "employee", "manager", "nobody"])
def test_only_engineers_have_engineer_profiles(db, target):
    assert call("PATCH", f"/engineers/{target}", ADMIN, {"name": "X"}) == (
        404, {"error": {"message": "Engineer not found", "details": {}}})


@pytest.mark.parametrize("change", [{"is_active": False}, {"team_id": 1}], ids=["deactivate", "move team"])
def test_open_work_must_be_reassigned_first(db, change):
    status, body = call("PATCH", "/engineers/5", ADMIN, change)
    assert (status, body["error"]["message"]) == (409, "Reassign their 2 open incidents first")
    assert db["updates"] == []


def test_deactivates_reactivates_and_moves_without_open_work(db):
    assert call("PATCH", "/engineers/4", ADMIN, {"is_active": False})[1]["is_active"] is False
    assert call("PATCH", "/engineers/4", ADMIN, {"is_active": True})[1]["is_active"] is True
    assert call("PATCH", "/engineers/4", ADMIN, {"team_id": 2})[1]["team_id"] == 2


def test_availability_can_change_with_open_work(db):
    assert call("PATCH", "/engineers/5", ADMIN, {"is_available": False})[0] == 200


def test_changes_are_validated(db):
    status, body = call("PATCH", "/engineers/4", ADMIN, {"name": " ", "is_available": "yes", "team_id": 0})
    assert status == 400
    assert set(body["error"]["details"]) == {"name", "is_available", "team_id"}
    assert call("PATCH", "/engineers/4", ADMIN, {}) == (400, {"error": {"message": "Nothing to change", "details": {}}})
    assert call("PATCH", "/engineers/4", ADMIN, {"team_id": 9})[1]["error"]["details"] == {
        "team_id": "Team does not exist"}
