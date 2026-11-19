"""
Unit tests for the facilities service: who may read and write, validation, duplicates and in-use deletes.
The repository is replaced by an in-memory fake; requests go through the real Lambda handler.
"""

import json
from contextlib import nullcontext
from types import SimpleNamespace

import pytest
from psycopg import errors as pg_errors

import function
import repository
import service
from common.auth import issue_token

ADMIN = {"id": 1, "role": "admin", "team_id": None}
EVE = {"id": 2, "role": "employee", "team_id": None}
FRED = {"id": 4, "role": "engineer", "team_id": 1}
PAT = {"id": 8, "role": "manager", "team_id": 1}

UNIQUE = {  # (table, column(s)) -> constraint name, like the real schema
    "buildings": (("name",), "buildings_name_key"),
    "floors": (("building_id", "name"), "floors_building_id_name_key"),
    "seats": (("floor_id", "code"), "seats_floor_id_code_key"),
    "categories": (("name",), "categories_name_key"),
}


def violation(cls, constraint):
    """A psycopg error carrying a constraint name, as the database would raise it (psycopg's own class untouched)."""

    class Violation(cls):
        diag = SimpleNamespace(constraint_name=constraint)

    return Violation()


@pytest.fixture
def db(monkeypatch):
    """In-memory tables plus how many incidents use each row."""
    state = {
        "buildings": {1: {"id": 1, "name": "HQ Tower"}},
        "floors": {1: {"id": 1, "building_id": 1, "name": "Ground"}},
        "seats": {1: {"id": 1, "floor_id": 1, "code": "G-01"}},
        "categories": {1: {"id": 1, "name": "HVAC", "type": "facility", "team_id": 1}},
        "incidents": {},  # (table, id) -> count
        "teams": {1, 2},
    }

    def check_unique(table, row):
        columns, constraint = UNIQUE[table]
        for other in state[table].values():
            if other["id"] != row["id"] and all(other[c] == row[c] for c in columns):
                raise violation(pg_errors.UniqueViolation, constraint)
        if table == "categories" and row["team_id"] not in state["teams"]:
            raise violation(pg_errors.ForeignKeyViolation, "categories_team_id_fkey")

    def insert(table, fields):
        row = {"id": max(state[table], default=0) + 1, **fields}
        check_unique(table, row)
        state[table][row["id"]] = row
        return row

    def update(table, row_id, fields):
        if row_id not in state[table]:
            return None
        row = {**state[table][row_id], **fields}
        check_unique(table, row)
        state[table][row_id] = row
        return row

    def usage(table, row_id):
        children = {"buildings": ("floors", "building_id"), "floors": ("seats", "floor_id")}
        counts = {}
        if table in children:
            child, column = children[table]
            counts[child] = sum(1 for r in state[child].values() if r[column] == row_id)
        counts["incidents"] = state["incidents"].get((table, row_id), 0)
        return counts

    monkeypatch.setattr(repository, "get", lambda table, row_id: state[table].get(row_id))
    monkeypatch.setattr(repository, "insert", insert)
    monkeypatch.setattr(repository, "update", update)
    monkeypatch.setattr(repository, "delete", lambda table, row_id: state[table].pop(row_id, None) is not None)
    monkeypatch.setattr(repository, "usage", usage)
    monkeypatch.setattr(repository, "list_buildings", lambda: list(state["buildings"].values()))
    monkeypatch.setattr(repository, "list_floors",
                        lambda b: [f for f in state["floors"].values() if f["building_id"] == b])
    monkeypatch.setattr(repository, "list_seats", lambda f: [s for s in state["seats"].values() if s["floor_id"] == f])
    monkeypatch.setattr(repository, "list_categories", lambda: list(state["categories"].values()))
    monkeypatch.setattr(repository, "list_teams", lambda: [{"id": 1, "name": "Facilities"}])
    monkeypatch.setattr(service, "transaction", nullcontext)
    return state


def call(method, path, user=None, body=None):
    """Invoke the Lambda handler like CloudFront would; return (status, parsed body)."""
    event = {
        "requestContext": {"http": {"method": method}},
        "rawPath": f"/api/facilities{path}",
        "headers": {"authorization": f"Bearer {issue_token(user)}"} if user else {},
        "body": json.dumps(body) if body is not None else None,
    }
    response = function.handler(event)
    return response["statusCode"], json.loads(response.get("body") or "null")


# --- access -----------------------------------------------------------------------

READS = [("GET", "/buildings"), ("GET", "/buildings/1/floors"), ("GET", "/floors/1/seats"),
         ("GET", "/categories"), ("GET", "/teams")]
WRITES = [("POST", "/buildings"), ("PUT", "/buildings/1"), ("DELETE", "/buildings/1"),
          ("POST", "/buildings/1/floors"), ("PUT", "/floors/1"), ("DELETE", "/floors/1"),
          ("POST", "/floors/1/seats"), ("PUT", "/seats/1"), ("DELETE", "/seats/1"),
          ("POST", "/categories"), ("PUT", "/categories/1"), ("DELETE", "/categories/1")]


@pytest.mark.parametrize("method,path", READS + WRITES)
def test_every_route_needs_a_token(db, method, path):
    assert call(method, path)[0] == 401


@pytest.mark.parametrize("method,path", READS)
def test_anyone_signed_in_can_read(db, method, path):
    assert call(method, path, EVE)[0] == 200


@pytest.mark.parametrize("user", [EVE, FRED, PAT], ids=["employee", "engineer", "manager"])
@pytest.mark.parametrize("method,path", WRITES)
def test_only_admins_write(db, user, method, path):
    assert call(method, path, user, {"name": "X"})[0] == 403


# --- buildings, floors, seats ------------------------------------------------------

def test_admin_creates_a_trimmed_building(db):
    assert call("POST", "/buildings", ADMIN, {"name": "  Riverside  "}) == (201, {"id": 2, "name": "Riverside"})


@pytest.mark.parametrize("body", [{}, {"name": "  "}, {"name": 5}, {"name": "x" * 101}])
def test_name_is_required_and_limited(db, body):
    status, error = call("POST", "/buildings", ADMIN, body)
    assert status == 400
    assert "name" in error["error"]["details"]


def test_duplicate_building_name_is_409(db):
    status, error = call("POST", "/buildings", ADMIN, {"name": "HQ Tower"})
    assert status == 409
    assert error["error"]["message"] == "A building called HQ Tower already exists"


def test_rename_and_unknown_building(db):
    assert call("PUT", "/buildings/1", ADMIN, {"name": "HQ"})[1]["name"] == "HQ"
    assert call("PUT", "/buildings/9", ADMIN, {"name": "HQ"})[0] == 404


def test_floors_belong_to_an_existing_building(db):
    status, floor = call("POST", "/buildings/1/floors", ADMIN, {"name": "Floor 1"})
    assert (status, floor["building_id"]) == (201, 1)
    assert call("POST", "/buildings/9/floors", ADMIN, {"name": "Floor 1"})[0] == 404
    assert call("GET", "/buildings/9/floors", EVE)[0] == 404


def test_floor_names_are_unique_within_a_building(db):
    status, error = call("POST", "/buildings/1/floors", ADMIN, {"name": "Ground"})
    assert (status, error["error"]["message"]) == (409, "This building already has a floor called Ground")


def test_seats_use_code_and_belong_to_an_existing_floor(db):
    assert call("POST", "/floors/1/seats", ADMIN, {"code": "G-02"})[0] == 201
    assert call("POST", "/floors/1/seats", ADMIN, {"name": "G-03"})[0] == 400
    assert call("POST", "/floors/1/seats", ADMIN, {"code": "G-01"})[0] == 409
    assert call("POST", "/floors/9/seats", ADMIN, {"code": "G-01"})[0] == 404


def test_lists_filter_by_parent(db):
    assert [f["name"] for f in call("GET", "/buildings/1/floors", EVE)[1]] == ["Ground"]
    assert [s["code"] for s in call("GET", "/floors/1/seats", EVE)[1]] == ["G-01"]


# --- deleting what's in use ------------------------------------------------------------

def test_children_must_go_first(db):
    assert call("DELETE", "/buildings/1", ADMIN)[1]["error"]["message"] == "Delete its 1 floor first"
    assert call("DELETE", "/floors/1", ADMIN)[1]["error"]["message"] == "Delete its 1 seat first"
    assert call("DELETE", "/seats/1", ADMIN)[0] == 204
    assert call("DELETE", "/floors/1", ADMIN)[0] == 204
    assert call("DELETE", "/buildings/1", ADMIN)[0] == 204
    assert db["buildings"] == {}


@pytest.mark.parametrize("table,path", [("seats", "/seats/1"), ("categories", "/categories/1")])
def test_anything_used_by_incidents_stays(db, table, path):
    db["incidents"][(table, 1)] = 3
    status, error = call("DELETE", path, ADMIN)
    assert (status, error["error"]["message"]) == (409, "Used by 3 incidents, so it can't be deleted")
    assert 1 in db[table]


def test_incident_use_is_reported_before_children(db):
    db["incidents"][("buildings", 1)] = 1
    assert call("DELETE", "/buildings/1", ADMIN)[1]["error"]["message"] == "Used by 1 incident, so it can't be deleted"


def test_deleting_a_missing_row_is_404(db):
    assert call("DELETE", "/seats/9", ADMIN)[0] == 404


# --- categories -------------------------------------------------------------------

def test_admin_creates_a_category_for_a_team(db):
    status, category = call("POST", "/categories", ADMIN, {"name": "Lifts", "type": "facility", "team_id": 2})
    assert (status, category["team_id"]) == (201, 2)


def test_category_validation_names_each_field(db):
    status, error = call("POST", "/categories", ADMIN, {"name": " ", "type": "other", "team_id": True})
    assert status == 400
    assert set(error["error"]["details"]) == {"name", "type", "team_id"}


def test_category_team_must_exist(db):
    status, error = call("PUT", "/categories/1", ADMIN, {"name": "HVAC", "type": "facility", "team_id": 99})
    assert (status, error["error"]["details"]) == (400, {"team_id": "Team does not exist"})


def test_duplicate_category_is_409(db):
    call("POST", "/categories", ADMIN, {"name": "Lifts", "type": "facility", "team_id": 1})
    assert call("PUT", "/categories/1", ADMIN, {"name": "Lifts", "type": "facility", "team_id": 1})[0] == 409
