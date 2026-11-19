"""
PostgreSQL access shared by all services: one connection per Lambda container,
transactions, and creating (and, in the cloud, seeding) the schema on cold start.
"""

import logging
import os
import re
import time
from pathlib import Path

from psycopg import Connection, OperationalError, Transaction, connect
from psycopg.rows import dict_row

from common.auth import hash_password

logger = logging.getLogger()

IS_LOCAL = os.getenv("IS_LOCAL", "false") == "true"

PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER') or 'postgres'} "
    f"password={os.getenv('POSTGRES_PASS') or 'postgres123'} "
    f"dbname={os.getenv('POSTGRES_NAME') or 'postgres'} "
    f"connect_timeout=15"
    + ("" if IS_LOCAL else " sslmode=require")
)

SCHEMA_FILE = Path(__file__).with_name("schema.sql")
SEED_FILE = Path(__file__).with_name("seed.sql")
SEED_VERSION_LINE = re.compile(r"-- seed-version: (\d+)")
CONNECT_RETRY_DELAY = 2  # seconds; Aurora Serverless can refuse the first connection while it resumes
SCHEMA_LOCK_ID = 7_001  # any constant; serialises schema creation across concurrent cold starts

IDLE_CHECK_AFTER = 30  # seconds idle before a cached connection is checked with SELECT 1

_conn: Connection | None = None
_last_used = 0.0
_schema_ready = False


def get_conn() -> Connection:
    """
    Return the container's autocommit connection (rows as dicts), reconnecting if it dropped.
    A Lambda container keeps its connection between requests, but Aurora closes connections when it
    pauses or scales. psycopg only notices on the next query, so a connection idle for a while is
    checked first; otherwise the first request after every pause would fail with a 500.
    """
    global _conn, _last_used
    now = time.monotonic()
    if _conn is not None and not (_conn.closed or _conn.broken) and now - _last_used > IDLE_CHECK_AFTER:
        try:
            _conn.execute("SELECT 1")
        except OperationalError:
            logger.warning("Database connection went stale while idle; reconnecting")
            _conn = None
    _last_used = now
    if _conn is None or _conn.closed or _conn.broken:
        try:
            _conn = connect(PG_CONFIG, autocommit=True, row_factory=dict_row)
        except OperationalError:
            logger.warning("Database connection failed; retrying once (database may be resuming)")
            time.sleep(CONNECT_RETRY_DELAY)
            _conn = connect(PG_CONFIG, autocommit=True, row_factory=dict_row)
    return _conn


def transaction() -> Transaction:
    """Start a transaction: `with transaction(): ...` commits on success, rolls back on error."""
    return get_conn().transaction()


def ensure_schema() -> None:
    """
    Apply schema.sql once per container, then (when SEED_ON_EMPTY=true) seed an empty database or reload
    the seed when the database's seed version is older (seed_if_needed).
    The cloud DB is only reachable from Lambdas, so this is how it gets its tables and demo data.
    """
    global _schema_ready
    if _schema_ready:
        return
    conn = get_conn()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (SCHEMA_LOCK_ID,))
        drop_empty_leftover_tables(conn)
        conn.execute(SCHEMA_FILE.read_text())
        seed_if_needed(conn)
    _schema_ready = True


# Every table seed.sql fills, children first; with app_meta, every table in schema.sql
# (the same list as bin/init-db.sh --reset).
SEEDED_TABLES = ("incident_feedback", "incident_events", "incident_notes", "incidents", "seats", "floors",
                 "buildings", "users", "categories", "teams")
APP_TABLES = (*SEEDED_TABLES, "app_meta")


def drop_empty_leftover_tables(conn: Connection) -> bool:
    """
    Drop the app's tables when they exist but hold no users and no incidents. Returns True if dropped.
    schema.sql uses CREATE TABLE IF NOT EXISTS, so tables left by an older, never-seeded deploy keep
    their old columns and the new schema fails on them. With no users nobody could have entered data,
    so rebuilding is safe. Only when SEED_ON_EMPTY=true (the deployed app); never with any users.
    """
    if os.getenv("SEED_ON_EMPTY", "false") != "true":
        return False
    found = conn.execute(
        "SELECT to_regclass('users') IS NOT NULL AS users, to_regclass('incidents') IS NOT NULL AS incidents"
    ).fetchone()
    if not found["users"]:
        return False  # fresh database: nothing to drop
    if conn.execute("SELECT EXISTS (SELECT 1 FROM users) AS any").fetchone()["any"]:
        return False
    if found["incidents"] and conn.execute("SELECT EXISTS (SELECT 1 FROM incidents) AS any").fetchone()["any"]:
        return False
    conn.execute(f"DROP TABLE IF EXISTS {', '.join(APP_TABLES)} CASCADE")
    logger.warning("Dropped empty leftover tables so the current schema can be created")
    return True


def seed_version(sql: str) -> int:
    """The version on seed.sql's "-- seed-version: N" first line (written by bin/generate_seed.py); 0 if none."""
    match = SEED_VERSION_LINE.match(sql)
    return int(match.group(1)) if match else 0


def seed_if_needed(conn: Connection) -> bool:
    """
    Load seed.sql into a database with no users, or reload it when the database holds an older seed version
    (its app_meta row is missing or lower than seed.sql's). Returns True if it seeded.
    A reload wipes every app table first, so bumping the version in bin/generate_seed.py resets the cloud's
    demo data on the next deploy. Never downgrades: a newer seed in the database is left alone.
    Outside local development the seeded users get SEED_PASSWORD (re-hashed per user) instead of
    the dev password in seed.sql; without SEED_PASSWORD nothing is seeded, so a public deployment
    never has accounts with a documented password.
    """
    if os.getenv("SEED_ON_EMPTY", "false") != "true" or not SEED_FILE.exists():
        return False
    sql = SEED_FILE.read_text()
    has_users = conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"] > 0
    if has_users:
        row = conn.execute("SELECT value FROM app_meta WHERE key = 'seed_version'").fetchone()
        current = int(row["value"]) if row else 0
        if current >= seed_version(sql):
            return False
    password = os.getenv("SEED_PASSWORD")
    if not IS_LOCAL and not password:
        logger.warning("Seed data needed but SEED_PASSWORD is not set; skipping seed data")
        return False

    if has_users:
        logger.warning("Replacing the demo data with seed version %s", seed_version(sql))
        conn.execute(f"TRUNCATE {', '.join(SEEDED_TABLES)} RESTART IDENTITY CASCADE")
    conn.execute(sql)
    if password:
        for row in conn.execute("SELECT id FROM users").fetchall():
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(password), row["id"]))
    logger.info("Seeded the database (seed version %s)", seed_version(sql))
    return True
