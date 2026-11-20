"""Unit tests for the auth service, with the repository replaced by an in-memory fake."""

import json

import pytest
from psycopg import errors as pg_errors

import function
import repository
from common import lookups
from common.auth import decode_token, hash_password, issue_token

PASSWORD = "Password123!"
EVE = {"id": 2, "email": "eve@acme.inc", "name": "Eve", "role": "employee", "team_id": None,
       "team_name": None, "is_available": True, "is_active": True, "created_at": "2026-01-01"}


@pytest.fixture
def db(monkeypatch):
    """A tiny in-memory users table behind the repository functions."""
    users = {2: {**EVE, "password_hash": hash_password(PASSWORD)}}

    def insert_user(fields):
        if any(u["email"] == fields["email"] for u in users.values()):
            raise pg_errors.UniqueViolation("duplicate key value violates unique constraint")
        new_id = max(users) + 1
        users[new_id] = {**EVE, **fields, "id": new_id, "team_name": None, "is_active": True}
        return new_id

    def get_credentials(email):
        user = next((u for u in users.values() if u["email"] == email), None)
        return user and {k: user[k] for k in ("id", "password_hash", "is_active")}

    def get_user(user_id):
        user = users.get(user_id)
        return user and {k: v for k, v in user.items() if k != "password_hash"}

    monkeypatch.setattr(repository, "insert_user", insert_user)
    monkeypatch.setattr(repository, "get_credentials", get_credentials)
    monkeypatch.setattr(lookups, "get_user", get_user)
    return users


def call(method, path, body=None, token=None):
    """Invoke the Lambda handler like the Function URL would; return (status, parsed body)."""
    event = {
        "requestContext": {"http": {"method": method}},
        "rawPath": path,
        "headers": {"authorization": f"Bearer {token}"} if token else {},
        "body": json.dumps(body) if body is not None else None,
    }
    response = function.handler(event)
    return response["statusCode"], json.loads(response.get("body") or "null")


# --- register ---------------------------------------------------------------

def test_register_creates_employee_and_signs_in(db):
    status, body = call("POST", "/register", {"name": " New Person ", "email": "New@ACME.inc", "password": PASSWORD})
    assert status == 201
    assert body["user"]["email"] == "new@acme.inc"
    assert body["user"]["role"] == "employee"
    assert body["user"]["name"] == "New Person"
    assert "password_hash" not in body["user"]
    assert decode_token(body["token"])["id"] == body["user"]["id"]


def test_register_ignores_requested_role(db):
    body_in = {"name": "X", "email": "x@acme.inc", "password": PASSWORD, "role": "admin"}
    status, body = call("POST", "/register", body_in)
    assert status == 201
    assert body["user"]["role"] == "employee"


def test_register_validation_names_each_field(db):
    status, body = call("POST", "/register", {"name": "", "email": "me@gmail.com", "password": "short"})
    assert status == 400
    assert set(body["error"]["details"]) == {"name", "email", "password"}


def test_register_wrong_types_are_field_errors_not_500(db):
    body_in = {"name": 123, "email": ["x@acme.inc"], "password": ["a"] * 8}
    status, body = call("POST", "/register", body_in)
    assert status == 400
    assert set(body["error"]["details"]) == {"name", "email", "password"}


def test_register_name_length_is_capped(db):
    status, body = call("POST", "/register", {"name": "x" * 101, "email": "x@acme.inc", "password": PASSWORD})
    assert status == 400
    assert set(body["error"]["details"]) == {"name"}
    status, _ = call("POST", "/register", {"name": "x" * 100, "email": "x@acme.inc", "password": PASSWORD})
    assert status == 201


def test_register_duplicate_email_is_409(db):
    status, body = call("POST", "/register", {"name": "Eve", "email": "EVE@acme.inc", "password": PASSWORD})
    assert status == 409
    assert "email" in body["error"]["details"]


# --- login ------------------------------------------------------------------

def test_login_success(db):
    status, body = call("POST", "/login", {"email": "Eve@Acme.inc", "password": PASSWORD})
    assert status == 200
    assert body["user"]["id"] == 2
    assert decode_token(body["token"]) == {"id": 2, "role": "employee", "team_id": None}


@pytest.mark.parametrize("body_in", [
    {"email": "eve@acme.inc", "password": "wrong-password"},  # wrong password
    {"email": "nobody@acme.inc", "password": PASSWORD},       # unknown email
    {},                                                       # both missing
    {"email": "eve@acme.inc"},                                # password missing
    {"email": "", "password": PASSWORD},                      # blank email
    {"email": 123, "password": ["x"]},                        # wrong types
])
def test_every_login_failure_is_the_same_401(db, body_in):
    status, body = call("POST", "/login", body_in)
    assert status == 401
    assert body["error"]["message"] == "Email or password is incorrect"
    assert not body["error"]["details"]


def test_login_deactivated_account_is_403(db):
    db[2]["is_active"] = False
    status, _ = call("POST", "/login", {"email": "eve@acme.inc", "password": PASSWORD})
    assert status == 403


# --- me and route protection ------------------------------------------------

def test_me_requires_token(db):
    status, _ = call("GET", "/me")
    assert status == 401


def test_me_returns_current_user(db):
    status, body = call("GET", "/me", token=issue_token(EVE))
    assert status == 200
    assert body["email"] == "eve@acme.inc"


def test_me_rejects_deactivated_user_with_valid_token(db):
    token = issue_token(EVE)
    db[2]["is_active"] = False
    status, _ = call("GET", "/me", token=token)
    assert status == 401


def test_cloudfront_path_prefix_is_stripped(db):
    status, _ = call("GET", "/api/auth/me", token=issue_token(EVE))
    assert status == 200


def test_unknown_route_is_404(db):
    status, _ = call("GET", "/nope")
    assert status == 404
