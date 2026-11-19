"""Unit tests for common/db.py: seeding (empty database or older seed version) and retrying the first connection."""

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
    """Records every statement; answers the user count, seed version and id queries."""

    def __init__(self, user_count, seed_version=None):
        self.user_count = user_count
        self.seed_version = seed_version  # the app_meta row; None = no row
        self.statements = []
        self.password_updates = []

    def execute(self, sql, params=None):
        self.statements.append(sql)
        if sql.startswith("SELECT count(*)"):
            return FakeResult([{"n": self.user_count}])
        if sql.startswith("SELECT value FROM app_meta"):
            return FakeResult([] if self.seed_version is None else [{"value": str(self.seed_version)}])
        if sql.startswith("SELECT id FROM users"):
            return FakeResult([{"id": 1}, {"id": 2}])
        if sql.startswith("UPDATE users SET password_hash"):
            self.password_updates.append(params)
        return FakeResult([])

    @property
    def ran_seed(self):
        return any("INSERT INTO users" in s for s in self.statements)

    @property
    def wiped(self):
        return any(s.startswith("TRUNCATE") for s in self.statements)


SEED_SQL = "-- seed-version: 3\nINSERT INTO users (id) VALUES (1);\n"


@pytest.fixture
def cloud(monkeypatch, tmp_path):
    """Cloud settings: seeding enabled, not local, and a seed.sql at version 3."""
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    monkeypatch.setattr(db, "IS_LOCAL", False)
    seed = tmp_path / "seed.sql"
    seed.write_text(SEED_SQL)
    monkeypatch.setattr(db, "SEED_FILE", seed)


def test_seeds_empty_cloud_db_with_seed_password(cloud, monkeypatch):
    monkeypatch.setenv("SEED_PASSWORD", "cloud-secret-123")
    conn = FakeConn(user_count=0)

    assert db.seed_if_needed(conn) is True
    assert conn.ran_seed
    # Every seeded user gets its own hash of the secret, never the dev password
    hashes = [h for h, _ in conn.password_updates]
    assert [uid for _, uid in conn.password_updates] == [1, 2]
    assert len(set(hashes)) == 2
    assert all(verify_password("cloud-secret-123", h) for h in hashes)


@pytest.mark.parametrize("version", [3, 4], ids=["same version", "newer version"])
def test_leaves_a_database_with_the_current_or_a_newer_seed(cloud, monkeypatch, version):
    monkeypatch.setenv("SEED_PASSWORD", "cloud-secret-123")
    conn = FakeConn(user_count=3, seed_version=version)
    assert db.seed_if_needed(conn) is False
    assert not conn.ran_seed and not conn.wiped


@pytest.mark.parametrize("version", [None, 2], ids=["seeded before versions", "older version"])
def test_replaces_an_older_seed(cloud, monkeypatch, version):
    monkeypatch.setenv("SEED_PASSWORD", "cloud-secret-123")
    conn = FakeConn(user_count=3, seed_version=version)

    assert db.seed_if_needed(conn) is True
    wipe = next(i for i, s in enumerate(conn.statements) if s.startswith("TRUNCATE"))
    seed = next(i for i, s in enumerate(conn.statements) if "INSERT INTO users" in s)
    assert wipe < seed
    assert "app_meta" not in conn.statements[wipe]  # the version row is rewritten by the seed, not wiped
    assert all(verify_password("cloud-secret-123", h) for h, _ in conn.password_updates)


def test_keeps_the_data_when_a_reseed_has_no_password(cloud, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    conn = FakeConn(user_count=3, seed_version=2)
    assert db.seed_if_needed(conn) is False
    assert not conn.wiped and not conn.ran_seed


def test_reads_the_seed_version_line():
    assert db.seed_version(SEED_SQL) == 3
    assert db.seed_version("INSERT INTO users (id) VALUES (1);") == 0


def test_cloud_without_seed_password_does_not_seed(cloud, monkeypatch):
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    conn = FakeConn(user_count=0)
    assert db.seed_if_needed(conn) is False
    assert not conn.ran_seed


def test_local_seeds_with_dev_passwords(monkeypatch, tmp_path):
    monkeypatch.setenv("SEED_ON_EMPTY", "true")
    seed = tmp_path / "seed.sql"
    seed.write_text(SEED_SQL)
    monkeypatch.setattr(db, "SEED_FILE", seed)
    monkeypatch.delenv("SEED_PASSWORD", raising=False)
    monkeypatch.setattr(db, "IS_LOCAL", True)
    conn = FakeConn(user_count=0)

    assert db.seed_if_needed(conn) is True
    assert conn.ran_seed
    assert conn.password_updates == []


def test_seeding_disabled_by_default(monkeypatch):
    monkeypatch.delenv("SEED_ON_EMPTY", raising=False)
    conn = FakeConn(user_count=0)
    assert db.seed_if_needed(conn) is False
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


class LeftoverConn:
    """Answers the leftover-table checks: which tables exist and whether they have rows."""

    def __init__(self, tables=(), users=0, incidents=0):
        self.tables, self.users, self.incidents = set(tables), users, incidents
        self.statements = []

    def execute(self, sql, params=None):
        self.statements.append(sql)
        if "to_regclass" in sql:
            return FakeResult([{"users": "users" in self.tables, "incidents": "incidents" in self.tables}])
        if "FROM users" in sql:
            return FakeResult([{"any": self.users > 0}])
        if "FROM incidents" in sql:
            return FakeResult([{"any": self.incidents > 0}])
        return FakeResult([])

    @property
    def dropped(self):
        return any(s.startswith("DROP TABLE") for s in self.statements)


def test_drops_empty_tables_left_by_an_older_deploy(cloud):
    conn = LeftoverConn(tables={"users", "incidents"})
    assert db.drop_empty_leftover_tables(conn) is True
    assert conn.dropped
    assert "incident_events" in conn.statements[-1] and "teams" in conn.statements[-1]


@pytest.mark.parametrize("conn", [
    LeftoverConn(tables=set()),                                # fresh database
    LeftoverConn(tables={"users", "incidents"}, users=1),      # has a user
    LeftoverConn(tables={"users", "incidents"}, incidents=1),  # has an incident
])
def test_never_drops_fresh_or_used_databases(cloud, conn):
    assert db.drop_empty_leftover_tables(conn) is False
    assert not conn.dropped


def test_never_drops_when_seeding_is_off(monkeypatch):
    monkeypatch.delenv("SEED_ON_EMPTY", raising=False)
    conn = LeftoverConn(tables={"users", "incidents"})
    assert db.drop_empty_leftover_tables(conn) is False
    assert conn.statements == []


class StaleConn:
    """A cached connection that Aurora has already closed: psycopg only finds out on the next query."""

    closed = broken = False

    def execute(self, sql, params=None):
        raise OperationalError("terminating connection due to administrator command")


def test_idle_stale_connection_is_replaced(monkeypatch):
    monkeypatch.setattr(db, "_conn", StaleConn())
    monkeypatch.setattr(db, "_last_used", db.time.monotonic() - db.IDLE_CHECK_AFTER - 1)
    monkeypatch.setattr(db, "connect", lambda *a, **k: "fresh connection")
    assert db.get_conn() == "fresh connection"


def test_recently_used_connection_is_not_rechecked(monkeypatch):
    conn = StaleConn()
    monkeypatch.setattr(db, "_conn", conn)
    monkeypatch.setattr(db, "_last_used", db.time.monotonic())
    monkeypatch.setattr(db, "connect", lambda *a, **k: "fresh connection")
    assert db.get_conn() is conn  # no SELECT 1 on every call within a request
