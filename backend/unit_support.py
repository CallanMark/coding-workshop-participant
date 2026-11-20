"""
Shared setup for every service's unit tests (backend/<service>/tests/). Each service's tests/conftest.py
imports these fixtures; they apply to every unit test automatically.

Unit tests fake the repository and common.lookups, so they never need a database. no_database makes that a
rule: a unit test that forgets to fake something fails with a clear message instead of quietly using
whatever database happens to be reachable (for example the integration tests' one, when CI runs both).
"""

import pytest


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    """Every test signs and verifies tokens with the same known secret."""
    monkeypatch.setenv("JWT_SECRET", "test-secret")


@pytest.fixture(autouse=True)
def no_schema(monkeypatch):
    """handle() normally creates the schema on first call; unit tests skip it."""
    import common.http

    monkeypatch.setattr(common.http, "ensure_schema", lambda: None)


@pytest.fixture(autouse=True)
def no_database(monkeypatch):
    """Any attempt to connect fails the test. (Tests of common/db.py patch connect themselves.)"""
    from common import db

    def refuse(*args, **kwargs):
        raise AssertionError("A unit test tried to use the database: fake the repository or common.lookups call")

    monkeypatch.setattr(db, "connect", refuse)
    monkeypatch.setattr(db, "_conn", None)  # never reuse a connection left open by integration tests
