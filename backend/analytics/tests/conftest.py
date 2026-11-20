"""Unit test setup for the analytics service: the shared fixtures in backend/unit_support.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # backend/, for unit_support

from unit_support import jwt_secret, no_database, no_schema  # noqa: E402, F401  (pytest finds them by name)
