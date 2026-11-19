"""Unit tests for the repository's whitelist (table and column names are put into SQL text)."""

import pytest

import repository


@pytest.mark.parametrize("call", [
    lambda: repository.get("users", 1),
    lambda: repository.insert("buildings", {"id": 1}),
    lambda: repository.update("floors", 1, {"building_id": 1, "secret": 2}),
    lambda: repository.delete("incidents", 1),
    lambda: repository.usage("teams", 1),
])
def test_only_known_tables_and_columns(call):
    with pytest.raises(ValueError):
        call()
