"""
PostgreSQL access shared by all services: one connection per Lambda container,
transactions, and creating the schema on cold start.
"""

import os
from pathlib import Path

from psycopg import Connection, Transaction, connect
from psycopg.rows import dict_row

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
SCHEMA_LOCK_ID = 7_001  # any constant; serialises schema creation across concurrent cold starts

_conn: Connection | None = None
_schema_ready = False


def get_conn() -> Connection:
    """Return the container's autocommit connection (rows as dicts), reconnecting if it dropped."""
    global _conn
    if _conn is None or _conn.closed or _conn.broken:
        _conn = connect(PG_CONFIG, autocommit=True, row_factory=dict_row)
    return _conn


def transaction() -> Transaction:
    """Start a transaction: `with transaction(): ...` commits on success, rolls back on error."""
    return get_conn().transaction()


def ensure_schema() -> None:
    """Apply schema.sql once per container. The cloud DB is only reachable from Lambdas."""
    global _schema_ready
    if _schema_ready:
        return
    conn = get_conn()
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (SCHEMA_LOCK_ID,))
        conn.execute(SCHEMA_FILE.read_text())
    _schema_ready = True
