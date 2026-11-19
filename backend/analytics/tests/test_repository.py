"""Unit tests for the analytics repository's SQL guards (no database)."""

import pytest

from repository import hotspots


def test_only_known_levels_can_appear_in_sql():
    with pytest.raises(ValueError):
        hotspots("1=1; DROP TABLE incidents; --", 30)
