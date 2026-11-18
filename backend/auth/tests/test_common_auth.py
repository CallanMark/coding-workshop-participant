"""Unit tests for common/auth.py: password hashing, tokens and role checks."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from common.auth import (
    decode_token,
    hash_password,
    issue_token,
    require_role,
    user_from_headers,
    verify_password,
)
from common.errors import Forbidden, Unauthorized

USER = {"id": 7, "role": "manager", "team_id": 2}


def test_hash_round_trip():
    stored = hash_password("Password123!")
    assert stored.startswith("scrypt$")
    assert verify_password("Password123!", stored)
    assert not verify_password("password123!", stored)


def test_same_password_gets_different_salt():
    assert hash_password("same") != hash_password("same")


@pytest.mark.parametrize("stored", ["", "not-set", "md5$x$y", "scrypt$1$2$3$zz$zz"])
def test_malformed_hash_never_verifies(stored):
    assert verify_password("anything", stored) is False


def test_token_round_trip():
    assert decode_token(issue_token(USER)) == USER


def test_expired_token_rejected():
    claims = {"sub": "7", "role": "manager", "team_id": 2, "exp": datetime.now(UTC) - timedelta(seconds=1)}
    token = jwt.encode(claims, "test-secret", algorithm="HS256")
    with pytest.raises(Unauthorized, match="expired"):
        decode_token(token)


def test_token_signed_with_other_secret_rejected():
    claims = {"sub": "7", "role": "admin", "team_id": None, "exp": datetime.now(UTC) + timedelta(hours=1)}
    forged = jwt.encode(claims, "attacker-secret", algorithm="HS256")
    with pytest.raises(Unauthorized):
        decode_token(forged)


def test_unsigned_token_rejected():
    forged = jwt.encode({"sub": "1", "role": "admin", "exp": 9999999999}, key=None, algorithm="none")
    with pytest.raises(Unauthorized):
        decode_token(forged)


@pytest.mark.parametrize("headers", [None, {}, {"Authorization": ""}, {"Authorization": "Basic abc"},
                                     {"authorization": "Bearer"}, {"authorization": "Bearer not-a-jwt"}])
def test_bad_authorization_header_rejected(headers):
    with pytest.raises(Unauthorized):
        user_from_headers(headers)


def test_header_name_is_case_insensitive():
    assert user_from_headers({"Authorization": f"Bearer {issue_token(USER)}"}) == USER


def test_missing_secret_outside_local_fails_closed(monkeypatch):
    monkeypatch.delenv("JWT_SECRET")
    monkeypatch.setenv("IS_LOCAL", "false")
    with pytest.raises(RuntimeError):
        issue_token(USER)


def test_require_role():
    require_role(USER, "admin", "manager")
    with pytest.raises(Forbidden):
        require_role(USER, "admin")
