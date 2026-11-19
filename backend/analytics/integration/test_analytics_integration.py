"""
Analytics against a real database: every dashboard number is checked against an independent SQL count over
the seeded data, so a wrong query can't hide behind a fake. Access rules are checked end to end too.
"""

import pytest
from integration_support import query

ACTIVE = "('open', 'in_progress', 'blocked')"


def count(sql_text, params=None):
    return query(f"SELECT count(*) AS n FROM incidents i WHERE {sql_text}", params)[0]["n"]


@pytest.mark.parametrize("days", [7, 30, 90])
def test_team_dashboard_counts_match_the_database(api, days):
    status, body = api("GET", "/teams/2", as_user="morgan@acme.inc", query_params={"days": str(days)})
    assert status == 200
    assert body["team"] == {"id": 2, "name": "Workplace Technology"}

    open_ = body["open"]
    assert open_["total"] == count(f"team_id = 2 AND status IN {ACTIVE}")
    assert open_["escalated"] == count(f"team_id = 2 AND status IN {ACTIVE} AND is_escalated")
    for status_name, n in open_["by_status"].items():
        assert n == count("team_id = 2 AND status = %s", (status_name,))
    for priority, n in open_["by_priority"].items():
        assert n == count(f"team_id = 2 AND status IN {ACTIVE} AND priority = %s", (priority,))

    window = "now() - make_interval(days => %s)"
    assert body["speed"]["reported"] == count(f"team_id = 2 AND created_at >= {window}", (days,))
    assert body["speed"]["resolved"] == count(f"team_id = 2 AND resolved_at >= {window}", (days,))
    top = query(f"""SELECT c.name, count(*) AS n FROM incidents i JOIN categories c ON c.id = i.category_id
                    WHERE i.team_id = 2 AND i.created_at >= {window}
                    GROUP BY c.name ORDER BY n DESC, c.name LIMIT 10""", (days,))
    assert [(c["name"], c["incidents"]) for c in body["categories"]] == [(r["name"], r["n"]) for r in top]


def test_response_time_medians_match_postgres(api):
    body = api("GET", "/teams/1", as_user="pat@acme.inc", query_params={"days": "90"})[1]
    expected = query("""
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at)) AS m
        FROM incidents WHERE team_id = 1 AND resolved_at >= now() - interval '90 days'
    """)[0]["m"]
    assert body["speed"]["median_seconds"]["resolve"] == pytest.approx(expected, abs=1)
    assert body["speed"]["median_seconds"]["resolve"] > 0


def test_oldest_open_are_really_the_oldest(api):
    body = api("GET", "/teams/2", as_user="tina@acme.inc")[1]
    oldest = query(f"""SELECT id FROM incidents WHERE team_id = 2 AND status IN {ACTIVE}
                       ORDER BY created_at, id LIMIT 5""")
    assert [i["id"] for i in body["oldest_open"]] == [r["id"] for r in oldest]


def test_engineer_dashboard_hides_ratings_from_the_engineer_only(api):
    own = api("GET", "/engineers/5", as_user="tina@acme.inc")[1]
    assert "feedback" not in own
    assert own["open"]["total"] == count(f"assignee_id = 5 AND status IN {ACTIVE}")

    managed = api("GET", "/engineers/5", as_user="morgan@acme.inc")[1]
    ratings = query("SELECT count(*) AS n, round(avg(rating), 1)::float AS avg "
                    "FROM incident_feedback WHERE engineer_id = 5")[0]
    assert (managed["feedback"]["ratings"], managed["feedback"]["average"]) == (ratings["n"], ratings["avg"])
    assert len(managed["feedback"]["recent"]) == min(5, ratings["n"])


def test_location_hotspots_rank_recurring_issues(api):
    body = api("GET", "/locations", as_user="admin@acme.inc", query_params={"days": "90"})[1]
    seats = body["seats"]
    assert seats, "the seed plants recurring hotspots"
    assert [s["recurring"] for s in seats] == sorted((s["recurring"] for s in seats), reverse=True)
    top = seats[0]
    assert top["incidents"] == count("seat_id = %s AND created_at >= now() - interval '90 days'", (top["id"],))
    assert top["recurring"] <= top["incidents"]


@pytest.mark.parametrize("who,path,expected", [
    ("pat@acme.inc", "/teams/2", 403),          # another team's manager
    ("fred@acme.inc", "/engineers/5", 403),     # another engineer
    ("eve@acme.inc", "/teams/2", 403),          # employees have no dashboards
    ("morgan@acme.inc", "/locations", 403),     # hotspots are admin only
    ("admin@acme.inc", "/engineers/7", 404),    # a manager has no engineer dashboard
])
def test_access_is_enforced_end_to_end(api, who, path, expected):
    assert api("GET", path, as_user=who)[0] == expected
