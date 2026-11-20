"""Unit tests for common/validate.py: the request-value rules every service shares."""

import pytest

from common import validate


@pytest.mark.parametrize("value,strip,expected", [
    ("  Fred  ", True, "Fred"), ("  pass word ", False, "  pass word "), (42, True, ""), (None, True, ""),
    (["x"], True, ""),
])
def test_text_reads_strings_and_blanks_anything_else(value, strip, expected):
    assert validate.text(value, strip=strip) == expected


@pytest.mark.parametrize("value,expected", [(1, True), (7, True), (0, False), (-3, False), (True, False),
                                            ("5", False), (2.0, False), (None, False)])
def test_is_id_accepts_positive_integers_only(value, expected):
    assert validate.is_id(value) is expected


@pytest.mark.parametrize("raw,expected", [("5", 5), (" 12 ", 12), ("0", None), ("-1", None), ("abc", None),
                                          ("", None), (None, None), ("1.5", None)])
def test_query_id_parses_positive_integers(raw, expected):
    assert validate.query_id(raw) == expected


def test_length_error_wording():
    assert validate.length_error("", "Name", 10) == "Name is required"
    assert validate.length_error("x" * 11, "Name", 10) == "Name must be at most 10 characters"
    assert validate.length_error("ok", "Name", 10) is None
    assert validate.length_error("", "Reason", 10, required=False) is None


def test_counted_wording():
    from common.errors import counted

    assert counted(1, "incident") == "1 incident"
    assert counted(3, "open incident") == "3 open incidents"
    assert counted(0, "seat") == "0 seats"
