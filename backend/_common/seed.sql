-- Mock data for local development. Safe to run repeatedly:
-- fixed ids + ON CONFLICT DO NOTHING, then sequences are moved past the seeded ids.
-- password_hash is a placeholder until the auth service defines the hash format.

INSERT INTO teams (id, name, description) VALUES
  (1, 'Facilities',           'HVAC, electrical and plumbing'),
  (2, 'Workplace Technology', 'Hardware, network and meeting-room AV')
ON CONFLICT DO NOTHING;

-- Each category routes its incidents to one team.
INSERT INTO categories (id, name, type, team_id) VALUES
  (1, 'HVAC',         'facility',   1),
  (2, 'Electrical',   'facility',   1),
  (3, 'Plumbing',     'facility',   1),
  (4, 'IT Hardware',  'technology', 2),
  (5, 'Network',      'technology', 2),
  (6, 'AV Equipment', 'technology', 2)
ON CONFLICT DO NOTHING;

-- Engineers and managers have a team; employees and admins don't.
INSERT INTO users (id, email, password_hash, name, role, team_id, is_available, created_by) VALUES
  (1, 'admin@acme.inc',  'not-set', 'Alex Admin',      'admin',    NULL, true,  NULL),
  (2, 'eve@acme.inc',    'not-set', 'Eve Employee',    'employee', NULL, true,  NULL),
  (3, 'sam@acme.inc',    'not-set', 'Sam Employee',    'employee', NULL, true,  NULL),
  (4, 'fred@acme.inc',   'not-set', 'Fred Facilities', 'engineer', 1,    true,  1),
  (5, 'tina@acme.inc',   'not-set', 'Tina Tech',       'engineer', 2,    true,  1),
  (6, 'omar@acme.inc',   'not-set', 'Omar Offline',    'engineer', 2,    false, 1),
  (7, 'morgan@acme.inc', 'not-set', 'Morgan Manager',  'manager',  2,    true,  1)
ON CONFLICT DO NOTHING;

INSERT INTO buildings (id, name) VALUES
  (1, 'HQ Tower'),
  (2, 'Riverside Annex')
ON CONFLICT DO NOTHING;

INSERT INTO floors (id, building_id, name) VALUES
  (1, 1, 'Ground'),
  (2, 1, 'Floor 1'),
  (3, 2, 'Ground')
ON CONFLICT DO NOTHING;

INSERT INTO seats (id, floor_id, code) VALUES
  (1, 1, 'G-01'),
  (2, 1, 'G-02'),
  (3, 2, '1-01'),
  (4, 3, 'RA-G-01')
ON CONFLICT DO NOTHING;

-- One incident per workflow status. team_id matches the category's team;
-- each assignee is an engineer on that team; timestamps fit the status.
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

-- Audit trail matching each incident's history above.
INSERT INTO incident_events (id, incident_id, actor_id, event_type, from_value, to_value, reason, created_at) VALUES
  -- #1 open
  (1,  1, 2, 'created',        NULL,          'open',        NULL, now() - interval '2 hours'),
  -- #2 in progress
  (2,  2, 3, 'created',        NULL,          'open',        NULL, now() - interval '1 day'),
  (3,  2, 1, 'assigned',       NULL,          '5',           NULL, now() - interval '22 hours'),
  (4,  2, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '20 hours'),
  -- #3 blocked and escalated
  (5,  3, 2, 'created',        NULL,          'open',        NULL, now() - interval '3 days'),
  (6,  3, 1, 'assigned',       NULL,          '5',           NULL, now() - interval '3 days' + interval '30 minutes'),
  (7,  3, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '3 days' + interval '1 hour'),
  (8,  3, 5, 'status_changed', 'in_progress', 'blocked',     'Waiting on replacement access point',
   now() - interval '3 days' + interval '2 hours'),
  (9,  3, 2, 'escalated',      'false',       'true',        'Whole team affected', now() - interval '2 days'),
  -- #4 resolved
  (10, 4, 3, 'created',        NULL,          'open',        NULL, now() - interval '5 days'),
  (11, 4, 1, 'assigned',       NULL,          '4',           NULL, now() - interval '5 days' + interval '1 hour'),
  (12, 4, 4, 'status_changed', 'open',        'in_progress', NULL, now() - interval '5 days' + interval '2 hours'),
  (13, 4, 4, 'status_changed', 'in_progress', 'resolved',    NULL, now() - interval '4 days'),
  -- #5 closed
  (14, 5, 2, 'created',        NULL,          'open',        NULL, now() - interval '10 days'),
  (15, 5, 1, 'assigned',       NULL,          '5',           NULL, now() - interval '10 days' + interval '10 minutes'),
  (16, 5, 5, 'status_changed', 'open',        'in_progress', NULL, now() - interval '10 days' + interval '15 minutes'),
  (17, 5, 5, 'status_changed', 'in_progress', 'resolved',    NULL, now() - interval '9 days'),
  (18, 5, 2, 'status_changed', 'resolved',    'closed',      NULL, now() - interval '8 days')
ON CONFLICT DO NOTHING;

-- Move each sequence past the highest id so new rows don't collide with seeded ones.
SELECT setval(pg_get_serial_sequence('teams', 'id'),           (SELECT max(id) FROM teams));
SELECT setval(pg_get_serial_sequence('categories', 'id'),      (SELECT max(id) FROM categories));
SELECT setval(pg_get_serial_sequence('users', 'id'),           (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('buildings', 'id'),       (SELECT max(id) FROM buildings));
SELECT setval(pg_get_serial_sequence('floors', 'id'),          (SELECT max(id) FROM floors));
SELECT setval(pg_get_serial_sequence('seats', 'id'),           (SELECT max(id) FROM seats));
SELECT setval(pg_get_serial_sequence('incidents', 'id'),       (SELECT max(id) FROM incidents));
SELECT setval(pg_get_serial_sequence('incident_notes', 'id'),  (SELECT max(id) FROM incident_notes));
SELECT setval(pg_get_serial_sequence('incident_events', 'id'), (SELECT max(id) FROM incident_events));
