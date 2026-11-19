"""Integration test setup for the facilities service: its real handler against a fresh, seeded PostgreSQL database."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/, for integration_support

from integration_support import Client, fresh_database  # noqa: E402

import function  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    """One fresh database for the whole run, seeded through the app's own cold-start path."""
    yield from fresh_database("facilities")


@pytest.fixture
def api():
    """api(method, path, as_user=email, body=..., query_params=...) -> (status, body)."""
    return Client(function.handler, "facilities")
