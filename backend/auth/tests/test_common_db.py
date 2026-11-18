"""Unit tests for common/db.py: seeding an empty database and retrying the first connection."""

import pytest
from psycopg import OperationalError

import common.db as db
from common.auth import verify_password


class FakeResult:
    """What conn.execute() returns: rows for fetchone/fetchall."""

    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class FakeConn:
    """Records every statement; answers the user count and id queries."""

    def __init__(self, user_count):
        self.user_count = user_count
        self.statements = []
        self.password_updates = []

    def execute(self, sql, params=None):
        self.statements.append(sql)
        if sql.startswith("SELECT count(*)"):
            return FakeResult([{"n": self.user_count}])
        if sql.startswith("SELECT id FROM users"):
            return FakeResult([{"id": 1}, {"id": 2}])
        if sql.startswith("UPDATE users SET password_hash"):
            self.password_updates.append(params)
        return FakeResult([])

    @property
    def ran_seed(self):
        return any("INSERT INTO users" in s for s in self.statements)


@pytest.fixture
def cloud(monkeypatch):
    """Cloud settings: seeding enabled, not local."""
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    monkeypatch.setattr(db, "IS_LOCAL", False)


def test_seeds_empty_cloud_db_with_seed_password(cloud, monkeypatch):
    monkeypatch.setenv("SEED_PASSWORD", "cloud-secret-123")
    conn = FakeConn(user_count=0)

    assert db.seed_if_empty(conn) is True
    assert conn.ran_seed
    # Every seeded user gets its own hash of the secret, never the dev password
    hashes = [h for h, _ in conn.password_updates]
    assert [uid for _, uid in conn.password_updates] == [1, 2]
    assert len(set(hashes)) == 2
    assert all(verify_password("cloud-secret-123", h) for h in hashes)


def test_never_seeds_a_database_that_has_users(cloud, monkeypatch):
    monkeypatch.setenv("SEED_PASSWORD", "cloud-secret-123")
    conn = FakeConn(user_count=3)
    assert db.seed_if_empty(conn) is False
    assert not conn.ran_seed


def test_cloud_without_seed_password_does_not_seed(cloud, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    conn = FakeConn(user_count=0)
    assert db.seed_if_empty(conn) is False
    assert not conn.ran_seed


def test_local_seeds_with_dev_passwords(monkeypatch):
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    monkeypatch.setattr(db, "IS_LOCAL", True)
    conn = FakeConn(user_count=0)

    assert db.seed_if_empty(conn) is True
    assert conn.ran_seed
    assert conn.password_updates == []


def test_seeding_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SEED_ON_EMPTY", raising=False)
    conn = FakeConn(user_count=0)
    assert db.seed_if_empty(conn) is False
    assert conn.statements == []


def test_first_connection_failure_is_retried_once(monkeypatch):
    calls = []

    def flaky_connect(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise OperationalError("database is resuming")
        return "connection"

    monkeypatch.setattr(db, "connect", flaky_connect)
    monkeypatch.setattr(db, "_conn", None)
    monkeypatch.setattr(db.time, "sleep", lambda s: None)

    assert db.get_conn() == "connection"
    assert len(calls) == 2
