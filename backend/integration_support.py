"""
Shared setup for the integration tests (backend/<service>/integration/): each service's real Lambda handler
against a real PostgreSQL database. Nothing is faked: routing, auth, validation, SQL and constraints all run.

Each service's integration/conftest.py imports this module. It:
- creates a fresh database per service (acme_it_<service>) on the configured server, dropping any old one;
- points common.db at it and lets the app's own startup create the schema and load seed.sql, exactly as a
  Lambda cold start does;
- signs requests as the seeded demo accounts (admin@acme.inc, eve@acme.inc, ...).

Needs a PostgreSQL server: POSTGRES_HOST / POSTGRES_PORT / POSTGRES_USER / POSTGRES_PASS, defaulting to the
local development database (localhost:5432, postgres / postgres123). Never touches the development database.
"""

import json
import os
import re

import psycopg
from psycopg import sql

JWT_SECRET = "integration-test-secret"


def server_config(dbname: str) -> str:
    """A libpq connection string for `dbname` on the configured server."""
    return (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} port={os.getenv('POSTGRES_PORT', '5432')} "
        f"user={os.getenv('POSTGRES_USER') or 'postgres'} password={os.getenv('POSTGRES_PASS') or 'postgres123'} "
        f"dbname={dbname} connect_timeout=10"
    )


def fresh_database(service: str):
    """
    Generator for a session fixture: create acme_it_<service>, point the app at it, seed it through the
    app's own cold-start path, yield its name, then close the app's connection.
    """
    from common import db  # the service's synced copy, imported once pytest has set the path

    name = f"acme_it_{service}"
    with psycopg.connect(server_config("postgres"), autocommit=True) as admin:
        admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))

    os.environ.update({"JWT_SECRET": JWT_SECRET, "SEED_ON_EMPTY": "true", "IS_LOCAL": "true"})
    os.environ.pop("SEED_PASSWORD", None)  # seeded accounts keep the dev password
    db.PG_CONFIG = re.sub(r"dbname=\S+", f"dbname={name}", db.PG_CONFIG.replace("sslmode=require", ""))
    db.IS_LOCAL = True
    db._conn = None
    db._schema_ready = False
    db.ensure_schema()  # creates the tables and loads seed.sql, as a Lambda's first request would
    yield name
    if db._conn is not None:
        db._conn.close()
        db._conn = None


def query(sql_text: str, params=None) -> list[dict]:
    """Read the test database directly, to check what a request really stored."""
    from common import db

    return db.get_conn().execute(sql_text, params).fetchall()


def token_for(email: str) -> str:
    """A signed token for a seeded account, as sign-in would issue it."""
    from common.auth import issue_token

    user = query("SELECT id, name, email, role, team_id FROM users WHERE email = %s", (email,))[0]
    return issue_token(user)


class Client:
    """Calls one service's Lambda handler the way the Function URL does; returns (status, json body)."""

    def __init__(self, handler, service: str):
        self.handler = handler
        self.service = service

    def __call__(self, method: str, path: str, as_user: str | None = None, body=None, query_params=None):
        event = {
            "requestContext": {"http": {"method": method}},
            "rawPath": f"/api/{self.service}{path}",
            "queryStringParameters": query_params,
            "headers": {"authorization": f"Bearer {token_for(as_user)}"} if as_user else {},
            "body": json.dumps(body) if body is not None else None,
        }
        response = self.handler(event)
        return response["statusCode"], json.loads(response.get("body") or "null")
