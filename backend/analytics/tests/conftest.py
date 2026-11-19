"""Shared test setup for the analytics service: a fixed JWT secret and no database on import."""

import pytest


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Every test signs and verifies tokens with the same known secret."""
    monkeypatch.setenv("JWT_SECRET", "test-secret")


@pytest.fixture(autouse=True)
def no_schema(monkeypatch):
    """handle() normally creates the schema on first call; unit tests never touch the database."""
    import common.http

    monkeypatch.setattr(common.http, "ensure_schema", lambda: None)
