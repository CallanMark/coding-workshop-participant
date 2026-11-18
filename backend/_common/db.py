"""
PostgreSQL access shared by all services: one connection per Lambda container,
transactions, and creating (and, in the cloud, seeding) the schema on cold start.
"""

import logging
import os
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
CONNECT_RETRY_DELAY = 2  # seconds; Aurora Serverless can refuse the first connection while it resumes
SCHEMA_LOCK_ID = 7_001  # any constant; serialises schema creation across concurrent cold starts

_conn: Connection | None = None
_schema_ready = False


def get_conn() -> Connection:
    """Return the container's autocommit connection (rows as dicts), reconnecting if it dropped."""
    global _conn
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
    Apply schema.sql once per container, then seed an empty database when SEED_ON_EMPTY=true.
    The cloud DB is only reachable from Lambdas, so this is how it gets its tables and demo data.
    """
    global _schema_ready
    if _schema_ready:
        return
    conn = get_conn()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (SCHEMA_LOCK_ID,))
        conn.execute(SCHEMA_FILE.read_text())
        seed_if_empty(conn)
    _schema_ready = True


def seed_if_empty(conn: Connection) -> bool:
    """
    Load seed.sql into a database with no users. Returns True if it seeded.
    Outside local development the seeded users get SEED_PASSWORD (re-hashed per user) instead of
    the dev password in seed.sql; without SEED_PASSWORD nothing is seeded, so a public deployment
    never has accounts with a documented password.
    """
    if os.getenv("SEED_ON_EMPTY", "false") != "true" or not SEED_FILE.exists():
        return False
    if conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"] > 0:
        return False
    password = os.getenv("SEED_PASSWORD")
    if not IS_LOCAL and not password:
        logger.warning("Database is empty but SEED_PASSWORD is not set; skipping seed data")
        return False

    conn.execute(SEED_FILE.read_text())
    if password:
        for row in conn.execute("SELECT id FROM users").fetchall():
            conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(password), row["id"]))
    logger.info("Seeded the empty database")
    return True
