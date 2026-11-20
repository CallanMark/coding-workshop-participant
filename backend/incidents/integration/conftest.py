"""Integration test setup for the incidents service: its real handler against a fresh, seeded PostgreSQL database."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/, for integration_support

from integration_support import make_fixtures  # noqa: E402

database, api = make_fixtures("incidents")
