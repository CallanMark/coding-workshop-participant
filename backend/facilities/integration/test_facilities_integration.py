"""
Facilities against a real database: building -> floor -> seat and category CRUD, the counts shown in the
admin tables, and the database rules behind the 409s (unique names, nothing deleted while in use).
"""

from integration_support import query

ADMIN = "admin@acme.inc"


def test_create_rename_and_delete_a_building_floor_and_seat(api):
    status, building = api("POST", "/buildings", as_user=ADMIN, body={"name": "Harbour House"})
    assert status == 201
    status, floor = api("POST", f"/buildings/{building['id']}/floors", as_user=ADMIN, body={"name": "Ground"})
    assert status == 201
    status, seat = api("POST", f"/floors/{floor['id']}/seats", as_user=ADMIN, body={"code": "HH-G-01"})
    assert status == 201

    assert api("PUT", f"/seats/{seat['id']}", as_user=ADMIN, body={"code": "HH-G-02"})[1]["code"] == "HH-G-02"
    assert api("PUT", f"/floors/{floor['id']}", as_user=ADMIN, body={"name": "Lobby"})[1]["name"] == "Lobby"
    assert api("PUT", f"/buildings/{building['id']}", as_user=ADMIN,
               body={"name": "Harbour Hall"})[1]["name"] == "Harbour Hall"

    listed = api("GET", "/buildings", as_user="eve@acme.inc")[1]  # anyone signed in can read
    harbour = next(b for b in listed if b["id"] == building["id"])
    assert (harbour["name"], harbour["floor_count"], harbour["incident_count"]) == ("Harbour Hall", 1, 0)

    # children first: a building with floors can't go
    assert api("DELETE", f"/buildings/{building['id']}", as_user=ADMIN)[0] == 409
    assert api("DELETE", f"/seats/{seat['id']}", as_user=ADMIN)[0] == 204
    assert api("DELETE", f"/floors/{floor['id']}", as_user=ADMIN)[0] == 204
    assert api("DELETE", f"/buildings/{building['id']}", as_user=ADMIN)[0] == 204
    assert query("SELECT count(*) AS n FROM buildings WHERE id = %s", (building["id"],))[0]["n"] == 0


def test_names_are_unique_where_the_schema_says_so(api):
    assert api("POST", "/buildings", as_user=ADMIN, body={"name": "HQ Tower"})[0] == 409
    assert api("POST", "/buildings/1/floors", as_user=ADMIN, body={"name": "Ground"})[0] == 409  # same building
    assert api("POST", "/buildings/2/floors", as_user=ADMIN, body={"name": "Floor 9"})[0] == 201  # elsewhere is fine
    assert api("POST", "/floors/1/seats", as_user=ADMIN, body={"code": "G-01"})[0] == 409
    assert api("POST", "/categories", as_user=ADMIN,
               body={"name": "HVAC", "type": "facility", "team_id": 1})[0] == 409


def test_nothing_in_use_by_incidents_can_be_deleted(api):
    used = query("""SELECT s.id, count(i.id) AS n FROM seats s JOIN incidents i ON i.seat_id = s.id
                    GROUP BY s.id ORDER BY s.id LIMIT 1""")[0]
    status, body = api("DELETE", f"/seats/{used['id']}", as_user=ADMIN)
    assert status == 409
    assert str(used["n"]) in body["error"]["message"]
    assert api("DELETE", "/categories/1", as_user=ADMIN)[0] == 409
    assert query("SELECT count(*) AS n FROM seats WHERE id = %s", (used["id"],))[0]["n"] == 1


def test_categories_route_to_an_existing_team(api):
    status, category = api("POST", "/categories", as_user=ADMIN,
                           body={"name": "Vending Machines", "type": "facility", "team_id": 1})
    assert status == 201
    listed = next(c for c in api("GET", "/categories", as_user="eve@acme.inc")[1] if c["id"] == category["id"])
    assert (listed["team_name"], listed["incident_count"]) == ("Facilities", 0)

    assert api("PUT", f"/categories/{category['id']}", as_user=ADMIN,
               body={"name": "Vending", "type": "facility", "team_id": 2})[1]["team_id"] == 2
    assert api("POST", "/categories", as_user=ADMIN,
               body={"name": "Ghost Team", "type": "facility", "team_id": 99})[0] == 400
    assert api("DELETE", f"/categories/{category['id']}", as_user=ADMIN)[0] == 204


def test_counts_match_the_database(api):
    floors = api("GET", "/buildings/1/floors", as_user=ADMIN)[1]
    expected = query("""
        SELECT f.name, (SELECT count(*) FROM seats s WHERE s.floor_id = f.id) AS seats,
               (SELECT count(*) FROM incidents i WHERE i.floor_id = f.id) AS incidents
        FROM floors f WHERE f.building_id = 1 ORDER BY f.name
    """)
    got = sorted((f["name"], f["seat_count"], f["incident_count"]) for f in floors)
    assert got == sorted((r["name"], r["seats"], r["incidents"]) for r in expected)


def test_only_the_admin_changes_facilities(api):
    assert api("POST", "/buildings", as_user="pat@acme.inc", body={"name": "Shed"})[0] == 403
    assert api("DELETE", "/seats/1", as_user="fred@acme.inc")[0] == 403
    assert api("GET", "/teams", as_user="eve@acme.inc")[0] == 200
