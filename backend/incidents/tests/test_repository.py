"""Unit tests for the list scope WHERE builder (pure SQL text; no database)."""

import pytest

from repository import scope_where, update_incident


def test_admin_sees_everything():
    assert scope_where(None, None) == ("", {})


def test_any_visibility_condition_is_enough():
    where, params = scope_where({"reporter_id": 4, "assignee_id": 4, "team_id": 1}, None)
    assert where == (" WHERE (i.reporter_id = %(scope_reporter_id)s OR i.assignee_id = %(scope_assignee_id)s"
                     " OR i.team_id = %(scope_team_id)s)")
    assert params == {"scope_reporter_id": 4, "scope_assignee_id": 4, "scope_team_id": 1}


def test_mine_is_added_on_top_of_the_scope():
    where, params = scope_where({"reporter_id": 2}, 2)
    assert where == (" WHERE (i.reporter_id = %(scope_reporter_id)s)"
                     " AND (i.reporter_id = %(mine)s OR i.assignee_id = %(mine)s)")
    assert params == {"scope_reporter_id": 2, "mine": 2}


def test_empty_scope_matches_nothing():
    assert scope_where({}, None) == (" WHERE FALSE", {})


def test_only_known_columns_can_appear_in_sql():
    with pytest.raises(ValueError):
        scope_where({"1=1; DROP TABLE incidents; --": 1}, None)


def test_filters_must_all_match():
    where, params = scope_where(None, None, {"status": "open", "assignee_id": None, "is_escalated": True})
    assert where == " WHERE i.status = %(f_status)s AND i.assignee_id IS NULL AND i.is_escalated = %(f_is_escalated)s"
    assert params == {"f_status": "open", "f_is_escalated": True}


def test_filters_add_to_the_scope():
    where, params = scope_where({"reporter_id": 2}, None, {"priority": "high"})
    assert where == " WHERE (i.reporter_id = %(scope_reporter_id)s) AND i.priority = %(f_priority)s"
    assert params == {"scope_reporter_id": 2, "f_priority": "high"}


def test_search_text_is_matched_literally():
    where, params = scope_where(None, None, {"q": "100%_off\\"})  # user typed: 100%_off\
    assert where == " WHERE (i.title ILIKE %(q)s OR i.description ILIKE %(q)s)"
    assert params == {"q": "%100\\%\\_off\\\\%"}  # wildcards and the backslash escaped


def test_only_known_filter_columns_can_appear_in_sql():
    with pytest.raises(ValueError):
        scope_where(None, None, {"reporter_id": 1})


def test_update_only_writes_known_columns():
    with pytest.raises(ValueError):
        update_incident(1, {"status": "closed"})
