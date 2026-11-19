#!/usr/bin/env python3
"""
Generate backend/_common/seed.sql: the demo data for local development and the cloud.

    python3 bin/generate_seed.py          # rewrite seed.sql
    python3 bin/generate_seed.py --check  # exit 1 if seed.sql is out of date (no write)

Deterministic: a fixed random seed, so the same script always writes the same file. Timestamps are written
relative to now() ("now() - interval '90 minutes'"), so the data never goes stale.

What it builds:
- The named demo accounts (admin, Eve, Sam, Fred, Tina, Omar, Morgan, Pat) with their fixed ids, plus more
  engineers and employees. Every account's local password is Password123!; in the cloud the loader replaces
  it with the SEED_PASSWORD secret.
- Three buildings with floors and seats, and ten categories split between the two teams.
- Five hand-written incidents (one per status) for walkthroughs, then about 250 generated over 120 days.
  Each generated incident is a full life story played forward to now: reported, assigned by the team
  manager, started, sometimes blocked, escalated or reopened, resolved and closed. Whatever hasn't happened
  yet by now decides its current status, so the status mix, response times and workloads come out realistic.
- Recurring hotspots: the same category reported at the same place again and again, for the location view.
- Notes, an audit event for every change, and reporter feedback whose ratings differ per engineer.

Bump SEED_VERSION whenever this output changes: the deployed app reloads the seed once when the version
in its database is older (see seed_if_needed in backend/_common/db.py). That wipes the cloud data.
"""

import random
import sys
from pathlib import Path

SEED_VERSION = 2
OUT = Path(__file__).resolve().parent.parent / "backend" / "_common" / "seed.sql"

# scrypt hash of the local dev password "Password123!", shared by every seeded account (local only).
DEV_HASH = ("scrypt$16384$8$1$93c0b52d16f4f2289eb0dbfa31487ed3$0d448185b71059684bac993fd0bb157fee27175e299c2be9"
            "ada55f004c38c7b54b6ceee16b58ab2dcdbd0543fb4d0713f3cc49d29cc4ce55f971895c7c880f57")

DAY = 24 * 60  # minutes
HISTORY_DAYS = 120
GENERATED = 230  # spread at random, on top of the hotspot runs below

FACILITIES, TECH = 1, 2
TEAMS = [(FACILITIES, "Facilities", "HVAC, electrical, plumbing, lighting and furniture"),
         (TECH, "Workplace Technology", "Hardware, network, printers, accounts and meeting-room AV")]

# id, name, type, team
CATEGORIES = [
    (1, "HVAC", "facility", FACILITIES), (2, "Electrical", "facility", FACILITIES),
    (3, "Plumbing", "facility", FACILITIES), (4, "IT Hardware", "technology", TECH),
    (5, "Network", "technology", TECH), (6, "AV Equipment", "technology", TECH),
    (7, "Lighting", "facility", FACILITIES), (8, "Furniture", "facility", FACILITIES),
    (9, "Printers", "technology", TECH), (10, "Accounts & Access", "technology", TECH),
]
CATEGORY_WEIGHTS = {1: 14, 2: 8, 3: 7, 4: 12, 5: 13, 6: 8, 7: 6, 8: 5, 9: 9, 10: 10}

# Users: id, email, name, role, team, available. Ids 1-8 are the documented demo accounts: keep them.
ADMIN, EVE, SAM, FRED, TINA, OMAR, MORGAN, PAT = 1, 2, 3, 4, 5, 6, 7, 8
USERS = [
    (1, "admin@acme.inc", "Alex Admin", "admin", None, True),
    (2, "eve@acme.inc", "Eve Employee", "employee", None, True),
    (3, "sam@acme.inc", "Sam Employee", "employee", None, True),
    (4, "fred@acme.inc", "Fred Facilities", "engineer", FACILITIES, True),
    (5, "tina@acme.inc", "Tina Tech", "engineer", TECH, True),
    (6, "omar@acme.inc", "Omar Offline", "engineer", TECH, False),
    (7, "morgan@acme.inc", "Morgan Manager", "manager", TECH, True),
    (8, "pat@acme.inc", "Pat Manager", "manager", FACILITIES, True),
    (9, "priya.patel@acme.inc", "Priya Patel", "engineer", FACILITIES, True),
    (10, "liam.walsh@acme.inc", "Liam Walsh", "engineer", FACILITIES, True),
    (11, "grace.kim@acme.inc", "Grace Kim", "engineer", FACILITIES, True),
    (12, "ravi.shah@acme.inc", "Ravi Shah", "engineer", TECH, True),
    (13, "chloe.martin@acme.inc", "Chloe Martin", "engineer", TECH, True),
] + [
    (14 + i, f"{first.lower()}.{last.lower()}@acme.inc", f"{first} {last}", "employee", None, True)
    for i, (first, last) in enumerate([
        ("Aisha", "Khan"), ("Ben", "Carter"), ("Chen", "Wei"), ("Diana", "Lopez"), ("Ethan", "Brooks"),
        ("Fatima", "Noor"), ("George", "Hill"), ("Hana", "Sato"), ("Isaac", "Reed"), ("Julia", "Novak"),
        ("Kofi", "Mensah"), ("Laura", "Byrne"), ("Mateo", "Silva"), ("Nora", "Quinn"),
    ])
]
EMPLOYEES = [u[0] for u in USERS if u[3] == "employee"]
MANAGER_OF = {FACILITIES: PAT, TECH: MORGAN}

# Engineer -> (share of the team's work, speed multiplier on work time, average rating out of 5).
ENGINEERS = {
    FRED: (4, 0.8, 4.6), 9: (3, 1.0, 4.3), 10: (3, 1.3, 3.5), 11: (2, 1.0, 4.0),
    TINA: (4, 1.1, 3.8), 12: (3, 0.9, 4.4), 13: (3, 1.5, 3.2), OMAR: (1, 1.0, 4.1),
}
OMAR_AWAY_DAYS = 21  # Omar is unavailable: no new work for him in the last three weeks

# Buildings, floors (id, building, name) and seats (floor -> codes). Ids 1-4 of seats are the originals.
BUILDINGS = [(1, "HQ Tower"), (2, "Riverside Annex"), (3, "Innovation Hub")]
FLOORS = [(1, 1, "Ground"), (2, 1, "Floor 1"), (3, 2, "Ground"), (4, 1, "Floor 2"), (5, 1, "Floor 3"),
          (6, 2, "Floor 1"), (7, 3, "Ground"), (8, 3, "Floor 1")]
SEAT_CODES = {
    1: ["G-01", "G-02", "G-03", "G-04", "G-05"],
    2: ["1-01", "1-02", "1-03", "1-04", "1-05", "1-06"],
    3: ["RA-G-01", "RA-G-02", "RA-G-03", "RA-G-04"],
    4: ["2-01", "2-02", "2-03", "2-04", "2-05", "2-06"],
    5: ["3-01", "3-02", "3-03", "3-04"],
    6: ["RA-1-01", "RA-1-02", "RA-1-03", "RA-1-04"],
    7: ["IH-G-01", "IH-G-02", "IH-G-03"],
    8: ["IH-1-01", "IH-1-02", "IH-1-03", "IH-1-04", "IH-1-05"],
}
ORIGINAL_SEATS = [(1, 1, "G-01"), (2, 1, "G-02"), (3, 2, "1-01"), (4, 3, "RA-G-01")]

TITLES = {
    1: [("Air con not cooling", "It's very warm by the windows all afternoon."),
        ("Heating not coming on", "Radiators stay cold even with the thermostat turned up."),
        ("Loud rattle from the air vent", "Constant rattling noise from the ceiling vent."),
        ("Room far too cold", "Temperature is around 16 degrees at my desk.")],
    2: [("Power socket not working", "Floor socket under the desk has no power."),
        ("Circuit breaker keeps tripping", "Power to the bank of desks cuts out a few times a day."),
        ("Burning smell from the plug", "Faint burning smell near the charging station.")],
    3: [("Leaking tap in the kitchen", "Tap drips constantly and the sink is filling up."),
        ("Toilet won't flush", "Cistern doesn't refill after flushing."),
        ("Water on the floor by the sink", "Small puddle keeps reappearing under the kitchen sink.")],
    4: [("Laptop won't power on", "No lights at all, even on the charger."),
        ("Monitor flickering", "Second screen flickers every few seconds."),
        ("Docking station not detecting screens", "Screens stay black when the laptop is docked."),
        ("Keyboard keys sticking", "Several keys stick or don't register.")],
    5: [("Wi-Fi keeps dropping", "Connection drops every few minutes."),
        ("No network on the desk port", "Ethernet port shows no link light."),
        ("Very slow internet", "Pages take ages to load and video calls freeze."),
        ("Can't connect to the VPN", "VPN times out when working from this floor.")],
    6: [("Meeting room screen has no signal", "HDMI cable shows no signal on the big screen."),
        ("Conference speaker crackling", "Remote attendees hear crackling during calls."),
        ("Room camera not detected", "Video call software can't find the room camera.")],
    7: [("Light flickering overhead", "Ceiling panel flickers and gives people headaches."),
        ("Lights out in the corridor", "A whole row of corridor lights is off."),
        ("Desk lamp broken", "Desk lamp won't switch on.")],
    8: [("Chair broken", "The chair won't hold its height and sinks slowly."),
        ("Desk won't raise", "Standing desk motor makes a noise but doesn't move."),
        ("Drawer lock jammed", "Pedestal drawer won't unlock with the key.")],
    9: [("Printer jammed", "Paper jam that keeps coming back after clearing it."),
        ("Printer offline", "Printer shows as offline for everyone on the floor."),
        ("Scans not arriving by email", "Scan to email sends nothing.")],
    10: [("Locked out of my account", "Too many password attempts and now I can't sign in."),
         ("Badge doesn't open the door", "My access badge is rejected at the floor entrance."),
         ("Need access to the shared drive", "Getting permission denied on the team drive.")],
}
FIXES = {
    1: "Recalibrated the thermostat and cleaned the filter.",
    2: "Replaced the faulty socket and tested the circuit.",
    3: "Replaced the washer and checked for further leaks.",
    4: "Swapped the faulty part; working again.",
    5: "Replaced the access point and confirmed a stable connection.",
    6: "Replaced the cable and reset the room system.",
    7: "Replaced the light fitting.",
    8: "Repaired the mechanism.",
    9: "Cleared the feed rollers and updated the driver.",
    10: "Reset the account and confirmed sign-in works.",
}
STARTS = ["On my way to take a look.", "Picking this up now.", "Looking into it, will update shortly.",
          "Checking this on site this morning."]
BLOCKS = ["Waiting on a replacement part from the supplier", "Needs a contractor visit to finish the work",
          "Waiting for the building landlord to approve access", "Waiting on the reporter to be at their desk"]
ESCALATIONS = ["Whole team affected and can't work", "Customer visit later today", "Still broken after two days",
               "Health and safety concern"]
FOLLOW_UPS = ["Any update on this?", "This is still happening today.", "Thanks, let me know if you need me there."]
CANCELS = ["Duplicate of an existing ticket", "Fixed itself after a restart", "Reported by mistake"]
REOPENS = ["Problem came back the next morning", "Only partly fixed"]
COMMENTS = {
    5: ["Fixed quickly and kept me updated.", "Brilliant, thank you!", "Really fast, much appreciated."],
    4: ["Sorted the same day.", "Good fix, thanks.", None],
    3: ["Works now, but took a while to hear back.", None, "Fine in the end."],
    2: ["Took days and I had to chase twice.", "Had to report it again before it was fixed."],
    1: ["Still not properly fixed.", "No updates at all for days."],
}

# Recurring hotspots: (category, floor, seat codes or None for floor-level, every N days on average).
HOTSPOTS = [
    (1, 4, ["2-02", "2-03", "2-04"], 9),       # HQ Tower Floor 2 air con, all summer long
    (5, 3, ["RA-G-01"], 8),                    # Riverside Annex Ground: one desk with dead Wi-Fi
    (3, 1, None, 14),                          # HQ Tower kitchen plumbing
    (6, 8, ["IH-1-02"], 12),                   # Innovation Hub meeting room AV
    (9, 2, ["1-04"], 13),                      # HQ Tower Floor 1 printer
]

# Minutes for each step by priority: (min, max).
ASSIGN = {"critical": (5, 30), "high": (10, 120), "medium": (30, 480), "low": (60, 1440)}
ACK = {"critical": (5, 30), "high": (10, 90), "medium": (20, 360), "low": (60, 1440)}
WORK = {"critical": (90, 720), "high": (240, 2880), "medium": (480, 7200), "low": (1440, 11520)}
ESCALATE_CHANCE = {"critical": 0.35, "high": 0.2, "medium": 0.06, "low": 0.02}
PRIORITY_WEIGHTS = {"low": 25, "medium": 45, "high": 22, "critical": 8}

# Picks demo data, never secrets.
rng = random.Random(20261119)  # nosec B311
floor_building = {f: b for f, b, _ in FLOORS}


def q(value) -> str:
    """A SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def ago(minutes: int) -> str:
    """A timestamp `minutes` before now."""
    return f"now() - interval '{minutes} minutes'"


def seats_table():
    """All seats with ids: the four originals first, then the rest in floor order."""
    seats = list(ORIGINAL_SEATS)
    taken = {(f, c) for _, f, c in ORIGINAL_SEATS}
    for floor, codes in SEAT_CODES.items():
        for code in codes:
            if (floor, code) not in taken:
                seats.append((len(seats) + 1, floor, code))
    return seats


SEATS = seats_table()
SEAT_ID = {(f, c): i for i, f, c in SEATS}


def pick(weights: dict):
    return rng.choices(list(weights), weights=list(weights.values()))[0]


def between(bounds, scale=1.0) -> int:
    low, high = bounds
    return max(1, int(rng.uniform(low, high) * scale))


def random_place(category: int):
    """A building, floor and (usually) seat. Plumbing happens in kitchens, so no seat."""
    floor = rng.choice(FLOORS)[0]
    seat = None
    if category not in (3, 7) and rng.random() < 0.7:
        seat = SEAT_ID[(floor, rng.choice(SEAT_CODES[floor]))]
    return floor_building[floor], floor, seat


def engineer_for(team: int, created_ago: int) -> int:
    pool = {e: w for e, (w, _, _) in ENGINEERS.items() if dict((u[0], u[4]) for u in USERS)[e] == team}
    if created_ago < OMAR_AWAY_DAYS * DAY:
        pool.pop(OMAR, None)
    return pick(pool)


def story(category: int, created_ago: int, place) -> dict:
    """
    One incident's full life, played forward from when it was reported. Steps that would happen after now
    are dropped, so the incident ends wherever it has got to.
    """
    team = next(c[3] for c in CATEGORIES if c[0] == category)
    manager = MANAGER_OF[team]
    priority = pick(PRIORITY_WEIGHTS)
    reporter = rng.choice(EMPLOYEES + [EVE, SAM, EVE, SAM])  # the demo employees report a bit more
    title, description = rng.choice(TITLES[category])
    steps = []  # (minutes after reporting, kind, data)
    t = 0

    def at(kind, **data):
        steps.append((t, kind, data))

    at("created")
    engineer = None
    if rng.random() < 0.04:  # cancelled before anyone picked it up
        t += between((30, 1440))
        at("status", actor=manager, old="open", new="closed", reason=rng.choice(CANCELS))
    else:
        backlog = priority == "low" and rng.random() < 0.15  # low priority work that waits a long time
        t += between(ASSIGN[priority], 12 if backlog else 1)
        engineer = engineer_for(team, created_ago)
        _, speed, _ = ENGINEERS[engineer]
        at("assigned", actor=manager, engineer=engineer)
        t += between(ACK[priority])
        at("status", actor=engineer, old="open", new="in_progress")
        at("note", author=engineer, body=rng.choice(STARTS))
        work = between(WORK[priority], speed)
        if rng.random() < 0.18:  # blocked part way through
            t += work // 3
            reason = rng.choice(BLOCKS)
            at("status", actor=engineer, old="in_progress", new="blocked", reason=reason)
            at("note", author=engineer, body=f"{reason}. Will pick it back up as soon as I can.")
            t += between((480, 5760), 8 if rng.random() < 0.3 else 1)  # some stay stuck for weeks
            at("status", actor=engineer, old="blocked", new="in_progress")
            work -= work // 3
        t += work
        at("status", actor=engineer, old="in_progress", new="resolved")
        at("note", author=engineer, body=FIXES[category])
        if rng.random() < 0.05:  # came back
            t += between((60, 1440))
            at("status", actor=manager, old="resolved", new="in_progress", reason=rng.choice(REOPENS))
            t += between((120, 1440))
            at("status", actor=engineer, old="in_progress", new="resolved")
        if rng.random() < 0.9:
            t += between((120, 2880))
            at("status", actor=rng.choice([engineer, manager]), old="resolved", new="closed")

    # Escalation by the reporter while it is still being worked on; the manager clears it at the latest when
    # the work is done.
    resolved_at = next((s for s, k, d in steps if k == "status" and d["new"] in ("resolved", "closed")), None)
    if rng.random() < ESCALATE_CHANCE[priority]:
        when = between((30, 1440))
        if resolved_at is None or when < resolved_at:
            reason = rng.choice(ESCALATIONS)
            steps.append((when, "escalated", {"actor": reporter, "reason": reason}))
            steps.append((when + 5, "note", {"author": reporter, "body": rng.choice(FOLLOW_UPS)}))
            # Half are cleared once the manager has dealt with it; the rest stand until the work is done.
            clear = when + between((120, 2880)) if rng.random() < 0.5 else resolved_at
            if clear is not None and resolved_at is not None:
                clear = min(clear, resolved_at)
            if clear is not None:
                steps.append((clear, "cleared", {"actor": manager}))

    steps.sort(key=lambda s: s[0])
    return {"category": category, "team": team, "priority": priority, "reporter": reporter, "title": title,
            "description": description, "place": place, "created_ago": created_ago, "steps": steps,
            "engineer": engineer, "feedback_roll": rng.random(), "rating_noise": rng.gauss(0, 0.7),
            "comment_roll": rng.random()}


def play(incident: dict, incident_id: int):
    """Apply the steps that have happened by now. Returns the incident row and its events, notes and feedback."""
    created = incident["created_ago"]
    state = {"status": "open", "assignee": None, "assigned": None, "acknowledged": None, "resolved": None,
             "closed": None, "blocked_reason": None, "escalated": False, "escalation_reason": None,
             "updated": created}
    events, notes = [], []
    for offset, kind, data in incident["steps"]:
        when = created - offset
        if when < 1:
            break  # not happened yet
        state["updated"] = min(state["updated"], when)
        if kind == "created":
            events.append((incident["reporter"], "created", None, "open", None, when))
        elif kind == "assigned":
            state["assignee"], state["assigned"] = data["engineer"], when
            events.append((data["actor"], "assigned", None, str(data["engineer"]), None, when))
        elif kind == "status":
            old, new = data["old"], data["new"]
            state["status"] = new
            state["blocked_reason"] = data.get("reason") if new == "blocked" else None
            if old == "open" and new == "in_progress" and state["acknowledged"] is None:
                state["acknowledged"] = when
            if new == "resolved":
                state["resolved"] = when
            if old == "resolved" and new == "in_progress":
                state["resolved"] = None
            if new == "closed":
                state["closed"] = when
            events.append((data["actor"], "status_changed", old, new, data.get("reason"), when))
        elif kind == "escalated":
            state["escalated"], state["escalation_reason"] = True, data["reason"]
            events.append((data["actor"], "escalated", "false", "true", data["reason"], when))
        elif kind == "cleared":
            state["escalated"], state["escalation_reason"] = False, None
            events.append((data["actor"], "escalated", "true", "false", None, when))
        elif kind == "note":
            notes.append((data["author"], data["body"], when))

    building, floor, seat = incident["place"]
    row = (incident_id, incident["title"], incident["description"], incident["category"], incident["team"],
           building, floor, seat, incident["reporter"], state["assignee"], state["status"], incident["priority"],
           state["escalated"], state["blocked_reason"], state["escalation_reason"], created, state["updated"],
           state["acknowledged"], state["assigned"], state["resolved"], state["closed"])

    feedback = None
    engineer = state["assignee"]
    if state["status"] in ("resolved", "closed") and engineer and incident["feedback_roll"] < 0.5:
        given = state["resolved"] - 60 if state["resolved"] else None
        if given and given >= 1:
            rating = min(5, max(1, round(ENGINEERS[engineer][2] + incident["rating_noise"])))
            comments = COMMENTS[rating]
            comment = comments[int(incident["comment_roll"] * len(comments))]
            feedback = (incident_id, incident["reporter"], engineer, rating, comment, given)
    return row, events, notes, feedback


def generated_incidents() -> list[dict]:
    incidents = []
    # Busier recently: draw ages from a skewed distribution over the history window.
    for _ in range(GENERATED):
        age = int((rng.random() ** 2.2) * HISTORY_DAYS * DAY) + 30
        category = pick(CATEGORY_WEIGHTS)
        incidents.append(story(category, age, random_place(category)))
    for category, floor, codes, every in HOTSPOTS:
        age = rng.randint(1, every) * DAY
        while age < HISTORY_DAYS * DAY:
            seat = SEAT_ID[(floor, rng.choice(codes))] if codes else None
            incidents.append(story(category, age + rng.randint(0, DAY), (floor_building[floor], floor, seat)))
            age += max(2, int(rng.gauss(every, every / 3))) * DAY
    incidents.sort(key=lambda i: -i["created_ago"])  # oldest first, so ids follow time
    return incidents


# --- the five hand-written walkthrough incidents (ids 1-5), kept from the original seed ----------------------

HAND_WRITTEN = """
-- Five hand-written incidents, one per workflow status, for walkthroughs (ids 1-5).
INSERT INTO incidents (id, title, description, category_id, team_id, building_id, floor_id, seat_id,
                       reporter_id, assignee_id, status, priority, is_escalated,
                       blocked_reason, escalation_reason,
                       created_at, updated_at, acknowledged_at, assigned_at, resolved_at, closed_at) VALUES
  (1, 'Air con not working', 'Very warm near the windows', 1, 1, 1, 1, 1,
   2, NULL, 'open', 'medium', false, NULL, NULL,
   now() - interval '2 hours', now() - interval '2 hours', NULL, NULL, NULL, NULL),
  (2, 'Monitor flickering', 'Second screen flickers constantly', 4, 2, 1, 2, 3,
   3, 5, 'in_progress', 'low', false, NULL, NULL,
   now() - interval '1 day', now() - interval '20 hours',
   now() - interval '20 hours', now() - interval '22 hours', NULL, NULL),
  (3, 'Wi-Fi drops on ground floor', 'Disconnects every few minutes', 5, 2, 2, 3, 4,
   2, 5, 'blocked', 'high', true, 'Waiting on replacement access point', 'Whole team affected',
   now() - interval '3 days', now() - interval '2 days',
   now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '30 minutes', NULL, NULL),
  (4, 'Leaking tap in kitchen', NULL, 3, 1, 1, 1, NULL,
   3, 4, 'resolved', 'medium', false, NULL, NULL,
   now() - interval '5 days', now() - interval '4 days',
   now() - interval '5 days' + interval '2 hours', now() - interval '5 days' + interval '1 hour',
   now() - interval '4 days', NULL),
  (5, 'Meeting room projector dead', 'No signal from HDMI', 6, 2, 1, 2, NULL,
   2, 5, 'closed', 'critical', false, NULL, NULL,
   now() - interval '10 days', now() - interval '8 days',
   now() - interval '10 days' + interval '15 minutes', now() - interval '10 days' + interval '10 minutes',
   now() - interval '9 days', now() - interval '8 days')
ON CONFLICT DO NOTHING;

INSERT INTO incident_notes (id, incident_id, author_id, body, created_at) VALUES
  (1, 2, 5, 'Swapping the cable first, will update shortly.', now() - interval '20 hours'),
  (2, 3, 5, 'Access point is faulty, replacement ordered.',   now() - interval '3 days' + interval '1 hour'),
  (3, 3, 2, 'Any ETA? The whole team is affected.',           now() - interval '2 days'),
  (4, 4, 4, 'Washer replaced, no more leak.',                 now() - interval '4 days')
ON CONFLICT DO NOTHING;

INSERT INTO incident_events (id, incident_id, actor_id, event_type, from_value, to_value, reason, created_at) VALUES
  (1,  1, 2, 'created',        NULL,          'open',        NULL, now() - interval '2 hours'),
  (2,  2, 3, 'created',        NULL,          'open',        NULL, now() - interval '1 day'),
  (3,  2, 7, 'assigned',       NULL,          '5',           NULL, now() - interval '22 hours'),
  (4,  2, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '20 hours'),
  (5,  3, 2, 'created',        NULL,          'open',        NULL, now() - interval '3 days'),
  (6,  3, 7, 'assigned',       NULL,          '5',           NULL, now() - interval '3 days' + interval '30 minutes'),
  (7,  3, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '3 days' + interval '1 hour'),
  (8,  3, 5, 'status_changed', 'in_progress', 'blocked',     'Waiting on replacement access point',
   now() - interval '3 days' + interval '2 hours'),
  (9,  3, 2, 'escalated',      'false',       'true',        'Whole team affected', now() - interval '2 days'),
  (10, 4, 3, 'created',        NULL,          'open',        NULL, now() - interval '5 days'),
  (11, 4, 8, 'assigned',       NULL,          '4',           NULL, now() - interval '5 days' + interval '1 hour'),
  (12, 4, 4, 'status_changed', 'open',        'in_progress', NULL, now() - interval '5 days' + interval '2 hours'),
  (13, 4, 4, 'status_changed', 'in_progress', 'resolved',    NULL, now() - interval '4 days'),
  (14, 5, 2, 'created',        NULL,          'open',        NULL, now() - interval '10 days'),
  (15, 5, 7, 'assigned',       NULL,          '5',           NULL, now() - interval '10 days' + interval '10 minutes'),
  (16, 5, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '10 days' + interval '15 minutes'),
  (17, 5, 5, 'status_changed', 'in_progress', 'resolved',    NULL, now() - interval '9 days'),
  (18, 5, 7, 'status_changed', 'resolved',    'closed',      NULL, now() - interval '8 days')
ON CONFLICT DO NOTHING;

INSERT INTO incident_feedback (id, incident_id, reporter_id, engineer_id, rating, comment,
                               created_at, updated_at) VALUES
  (1, 4, 3, 4, 5, 'Fixed the same day and left the kitchen clean.',
   now() - interval '4 days', now() - interval '4 days'),
  (2, 5, 2, 5, 3, 'Projector works now, but it took two days to hear anything back.',
   now() - interval '8 days', now() - interval '8 days')
ON CONFLICT DO NOTHING;
"""
HAND_WRITTEN_COUNTS = {"incidents": 5, "notes": 4, "events": 18, "feedback": 2}


def values(rows) -> str:
    """Rows of SQL literals as a VALUES list, one row per line."""
    return ",\n".join("  (" + ", ".join(row) + ")" for row in rows)


def insert(table: str, columns: str, rows) -> str:
    if not rows:
        return ""
    # Writes a file from this script's own constants; nothing user-supplied.
    return f"INSERT INTO {table} ({columns}) VALUES\n{values(rows)}\nON CONFLICT DO NOTHING;\n"  # nosec B608


VERSION_ROW = """
-- Which seed this database holds: the deployed app reloads the seed once when this is older than its own.
INSERT INTO app_meta (key, value) VALUES ('seed_version', {version})
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
"""


def build() -> str:
    out = [f"""-- seed-version: {SEED_VERSION}
-- GENERATED by bin/generate_seed.py: edit that script and re-run it, don't edit this file by hand.
-- Demo data for local development and the cloud. Safe to run repeatedly:
-- fixed ids + ON CONFLICT DO NOTHING, then sequences are moved past the seeded ids.
-- Every seeded account's local password is Password123!; in the cloud they get the SEED_PASSWORD secret.
"""]
    out.append("\n-- Teams own categories, engineers and incidents.\n")
    out.append(insert("teams", "id, name, description", [(q(i), q(n), q(d)) for i, n, d in TEAMS]))
    out.append("\n-- Each category routes its incidents to one team.\n")
    out.append(insert("categories", "id, name, type, team_id",
                      [(q(i), q(n), q(t), q(team)) for i, n, t, team in CATEGORIES]))
    out.append("\n-- Engineers and managers have a team (created by the admin); employees and admins don't.\n"
               "-- Ids 1-8 are the documented demo accounts.\n")
    out.append(insert("users", "id, email, password_hash, name, role, team_id, is_available, created_by", [
        (q(i), q(e), q(DEV_HASH), q(n), q(r), q(t), q(a), q(ADMIN if r in ("engineer", "manager") else None))
        for i, e, n, r, t, a in USERS]))
    out.append("\n")
    out.append(insert("buildings", "id, name", [(q(i), q(n)) for i, n in BUILDINGS]))
    out.append(insert("floors", "id, building_id, name", [(q(i), q(b), q(n)) for i, b, n in FLOORS]))
    out.append(insert("seats", "id, floor_id, code", [(q(i), q(f), q(c)) for i, f, c in SEATS]))
    out.append(HAND_WRITTEN)

    incidents, events, notes, feedback = [], [], [], []
    for n, incident in enumerate(generated_incidents()):
        row, ev, nt, fb = play(incident, HAND_WRITTEN_COUNTS["incidents"] + 1 + n)
        incidents.append(row)
        events += [(row[0], *e) for e in ev]
        notes += [(row[0], *x) for x in nt]
        if fb:
            feedback.append(fb)

    def stamp(minutes):
        return ago(minutes) if minutes is not None else "NULL"

    out.append(f"\n-- {len(incidents)} generated incidents over {HISTORY_DAYS} days, each played forward to now.\n")
    out.append(insert(
        "incidents",
        "id, title, description, category_id, team_id, building_id, floor_id, seat_id, reporter_id, assignee_id, "
        "status, priority, is_escalated, blocked_reason, escalation_reason, created_at, updated_at, "
        "acknowledged_at, assigned_at, resolved_at, closed_at",
        [(*(q(v) for v in r[:15]), *(stamp(m) for m in r[15:])) for r in incidents]))
    first = HAND_WRITTEN_COUNTS["notes"] + 1
    out.append("\n")
    out.append(insert("incident_notes", "id, incident_id, author_id, body, created_at", [
        (q(first + i), q(inc), q(author), q(body), ago(when)) for i, (inc, author, body, when) in enumerate(notes)]))
    first = HAND_WRITTEN_COUNTS["events"] + 1
    out.append("\n")
    out.append(insert("incident_events",
                      "id, incident_id, actor_id, event_type, from_value, to_value, reason, created_at", [
        (q(first + i), q(inc), q(actor), q(kind), q(old), q(new), q(reason), ago(when))
        for i, (inc, actor, kind, old, new, reason, when) in enumerate(events)]))
    first = HAND_WRITTEN_COUNTS["feedback"] + 1
    out.append("\n")
    out.append(insert("incident_feedback",
                      "id, incident_id, reporter_id, engineer_id, rating, comment, created_at, updated_at", [
                          (q(first + i), q(inc), q(rep), q(eng), q(rating), q(comment), ago(when), ago(when))
                          for i, (inc, rep, eng, rating, comment, when) in enumerate(feedback)]))

    out.append("\n-- Move each sequence past the highest id so new rows don't collide with seeded ones.\n")
    for table in ("teams", "categories", "users", "buildings", "floors", "seats", "incidents", "incident_notes",
                  "incident_events", "incident_feedback"):
        out.append(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT max(id) FROM {table}));\n")  # nosec B608
    out.append(VERSION_ROW.format(version=q(str(SEED_VERSION))))  # nosec B608
    return "".join(out)


def main() -> int:
    sql = build()
    if "--check" in sys.argv:
        if OUT.read_text() != sql:
            print(f"{OUT} is out of date: run python3 bin/generate_seed.py", file=sys.stderr)
            return 1
        return 0
    OUT.write_text(sql)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
