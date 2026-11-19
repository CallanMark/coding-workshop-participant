"""
Auth against a real database: registration, sign-in, the current user and engineer profiles, including what
the unit tests can only fake (unique emails, the users_team_matches_role constraint, real workload counts).
"""

from integration_support import query

PASSWORD = "Password123!"  # every seeded account's local password


def sign_in(api, email, password=PASSWORD):
    return api("POST", "/login", body={"email": email, "password": password})


# --- register, sign in, me ------------------------------------------------------------

def test_register_stores_a_hashed_employee_and_signs_them_in(api):
    status, body = api("POST", "/register", body={"name": "Ivy Integration", "email": "Ivy@ACME.inc",
                                                   "password": "Correct-horse-1"})
    assert status == 201
    assert body["user"]["role"] == "employee"
    stored = query("SELECT email, role, team_id, password_hash FROM users WHERE email = 'ivy@acme.inc'")[0]
    assert (stored["role"], stored["team_id"]) == ("employee", None)
    assert stored["password_hash"].startswith("scrypt$") and "Correct-horse-1" not in stored["password_hash"]

    status, body = sign_in(api, "ivy@acme.inc", "Correct-horse-1")
    assert status == 200
    assert api("GET", "/me", as_user="ivy@acme.inc")[1]["email"] == "ivy@acme.inc"


def test_an_email_can_only_register_once(api):
    status, body = api("POST", "/register", body={"name": "Eve Again", "email": "eve@acme.inc",
                                                   "password": PASSWORD})
    assert status == 409
    assert query("SELECT count(*) AS n FROM users WHERE email = 'eve@acme.inc'")[0]["n"] == 1


def test_seeded_accounts_sign_in_and_wrong_passwords_do_not(api):
    status, body = sign_in(api, "admin@acme.inc")
    assert status == 200 and body["user"]["role"] == "admin" and body["token"]
    assert sign_in(api, "admin@acme.inc", "wrong-password")[0] == 401
    assert sign_in(api, "nobody@acme.inc")[0] == 401


# --- engineer profiles ----------------------------------------------------------------

def test_admin_lists_engineers_with_real_workload_counts(api):
    status, body = api("GET", "/engineers", as_user="admin@acme.inc", query_params={"team_id": "2"})
    assert status == 200
    expected = query("""
        SELECT u.name, count(i.id) FILTER (WHERE i.status IN ('open', 'in_progress', 'blocked')) AS open
        FROM users u LEFT JOIN incidents i ON i.assignee_id = u.id
        WHERE u.role = 'engineer' AND u.team_id = 2 GROUP BY u.name ORDER BY u.name
    """)
    assert [(e["name"], e["open_incidents"]) for e in body] == [(r["name"], r["open"]) for r in expected]
    assert all(e["team_name"] == "Workplace Technology" for e in body)


def test_create_edit_deactivate_and_reactivate_an_engineer(api):
    status, created = api("POST", "/engineers", as_user="admin@acme.inc", body={
        "name": "Nia New", "email": "nia.new@acme.inc", "password": "Temporary123!", "team_id": 1})
    assert status == 201
    row = query("SELECT role, team_id, created_by FROM users WHERE id = %s", (created["id"],))[0]
    assert row == {"role": "engineer", "team_id": 1, "created_by": 1}
    assert sign_in(api, "nia.new@acme.inc", "Temporary123!")[0] == 200  # the temporary password works

    status, changed = api("PATCH", f"/engineers/{created['id']}", as_user="admin@acme.inc",
                          body={"name": "Nia Newton", "team_id": 2, "is_available": False})
    assert status == 200
    assert (changed["name"], changed["team_name"], changed["is_available"]) == (
        "Nia Newton", "Workplace Technology", False)

    assert api("PATCH", f"/engineers/{created['id']}", as_user="admin@acme.inc",
               body={"is_active": False})[0] == 200
    assert sign_in(api, "nia.new@acme.inc", "Temporary123!")[0] == 403  # deactivated: can't sign in
    assert api("PATCH", f"/engineers/{created['id']}", as_user="admin@acme.inc",
               body={"is_active": True})[0] == 200
    assert sign_in(api, "nia.new@acme.inc", "Temporary123!")[0] == 200


def test_an_engineer_with_open_incidents_stays_until_their_work_is_reassigned(api):
    open_work = query("""SELECT count(*) AS n FROM incidents
                         WHERE assignee_id = 5 AND status IN ('open', 'in_progress', 'blocked')""")[0]["n"]
    assert open_work > 0  # Tina, from the seed
    status, body = api("PATCH", "/engineers/5", as_user="admin@acme.inc", body={"is_active": False})
    assert (status, body["error"]["message"]) == (409, f"Reassign their {open_work} open incidents first")
    assert query("SELECT is_active FROM users WHERE id = 5")[0]["is_active"] is True


def test_creating_an_engineer_with_a_taken_email_or_missing_team_changes_nothing(api):
    before = query("SELECT count(*) AS n FROM users")[0]["n"]
    assert api("POST", "/engineers", as_user="admin@acme.inc", body={
        "name": "Dup", "email": "tina@acme.inc", "password": "Temporary123!", "team_id": 2})[0] == 409
    assert api("POST", "/engineers", as_user="admin@acme.inc", body={
        "name": "No Team", "email": "no.team@acme.inc", "password": "Temporary123!", "team_id": 99})[0] == 400
    assert query("SELECT count(*) AS n FROM users")[0]["n"] == before


def test_only_the_admin_manages_engineers(api):
    assert api("GET", "/engineers", as_user="morgan@acme.inc")[0] == 403
    assert api("POST", "/engineers", as_user="tina@acme.inc", body={})[0] == 403
