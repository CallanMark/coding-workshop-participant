"""Unit tests for route access in common/http.py: sign-in, role checks and route definitions."""

import json

import pytest

from common.auth import issue_token
from common.http import Route, handle

ADMIN = {"id": 1, "role": "admin", "team_id": None}
MANAGER = {"id": 7, "role": "manager", "team_id": 2}
EMPLOYEE = {"id": 2, "role": "employee", "team_id": None}

ROUTES = [
    Route("GET", "/open", lambda req: {"ok": True}, public=True),
    Route("GET", "/any", lambda req: {"user": req.user}),
    Route("GET", "/staff", lambda req: {"ok": True}, roles=("admin", "manager")),
]


def call(path, user=None):
    """Run a request through handle() with the test routes; return (status, parsed body)."""
    event = {
        "requestContext": {"http": {"method": "GET"}},
        "rawPath": path,
        "headers": {"authorization": f"Bearer {issue_token(user)}"} if user else {},
    }
    response = handle(event, "test", ROUTES)
    return response["statusCode"], json.loads(response.get("body") or "null")


def test_public_route_needs_no_token():
    assert call("/open")[0] == 200


def test_default_route_needs_a_token():
    assert call("/any")[0] == 401


def test_default_route_allows_any_role_and_sets_user():
    status, body = call("/any", EMPLOYEE)
    assert status == 200
    assert body["user"] == EMPLOYEE


@pytest.mark.parametrize("user", [ADMIN, MANAGER])
def test_role_route_allows_listed_roles(user):
    assert call("/staff", user)[0] == 200


def test_role_route_forbids_other_roles():
    status, body = call("/staff", EMPLOYEE)
    assert status == 403
    assert body["error"]["message"] == "Not allowed"


def test_role_route_still_needs_a_token():
    assert call("/staff")[0] == 401


def test_unknown_role_fails_when_routes_are_defined():
    with pytest.raises(ValueError, match="unknown role"):
        Route("GET", "/x", lambda req: None, roles=("admn",))


def test_public_route_cannot_require_roles():
    with pytest.raises(ValueError, match="public"):
        Route("GET", "/x", lambda req: None, public=True, roles=("admin",))
