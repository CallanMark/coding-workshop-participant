-- Mock data for local development. Safe to run repeatedly:
-- fixed ids + ON CONFLICT DO NOTHING, then sequences are moved past the seeded ids.
-- password_hash values are scrypt hashes (common/auth.py) of the dev password Password123!.

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
-- Every seeded user's password is Password123! (local development only).
INSERT INTO users (id, email, password_hash, name, role, team_id, is_available, created_by) VALUES
  (1, 'admin@acme.inc', 'scrypt$16384$8$1$93c0b52d16f4f2289eb0dbfa31487ed3$0d448185b71059684bac993fd0bb157fee27175e299c2be9ada55f004c38c7b54b6ceee16b58ab2dcdbd0543fb4d0713f3cc49d29cc4ce55f971895c7c880f57',
   'Alex Admin', 'admin', NULL, true, NULL),
  (2, 'eve@acme.inc', 'scrypt$16384$8$1$c5a2a747765ade869691406844c2fc14$a6d4f462212539cae564a8a1212fde7124ac80b4b6c90e03f6e748f4f3404a6e9f0bf8a2389768d9bf69aff9e4b2d03424547a5e9cc62760a4af3e36e2338075',
   'Eve Employee', 'employee', NULL, true, NULL),
  (3, 'sam@acme.inc', 'scrypt$16384$8$1$9abb58e46174338daf185c7949f69205$b7085c05ff920a22455878c54aab954718050fffbb1933dea549a8efedcb4c453dedfca3e7aecc1c8d01d745478f80852e3ead266a0e0660d82f862dd23402bf',
   'Sam Employee', 'employee', NULL, true, NULL),
  (4, 'fred@acme.inc', 'scrypt$16384$8$1$612cdceff257163711c6cd42e35dd0aa$44862379048875e53fefb28d41ffde8bf18d1645e0fba9b0155ce0ad3bd7f55a27246a9dbe04c83f3d036e18073b074420ad7a51c4f004a1480365bfc2c128c9',
   'Fred Facilities', 'engineer', 1, true, 1),
  (5, 'tina@acme.inc', 'scrypt$16384$8$1$71c71e3f8f4d99dc8620b88633945083$3debb00398af10b012a1f324872d9c260bca8aaf958341b1d6057f2814d2e455cea552cb82de39836cc51cf702014b42b73fa93b6cf752ab662b0548965e3d75',
   'Tina Tech', 'engineer', 2, true, 1),
  (6, 'omar@acme.inc', 'scrypt$16384$8$1$a452d0f86800af375a026686f2d60738$d8af2083b09e2c993d704a8e12f36ce33a391454e23691b996721c5bc089f457da5e137c8fac78b07e4eb000a42382c419f89f4b02e5f88ce49b6ce879a53817',
   'Omar Offline', 'engineer', 2, false, 1),
  (7, 'morgan@acme.inc', 'scrypt$16384$8$1$f9764da68c1a2c1ecea963dcd5055a44$11fe14805f3ebf1b7682b162d54a993ed821a41246708a53bfe8ba1c1257defa1ec69ecc069f8f71bdfb5d1179465f1563e9e9c3d422194bbd27f0a37270fb1d',
   'Morgan Manager', 'manager', 2, true, 1),
  (8, 'pat@acme.inc', 'scrypt$16384$8$1$61170a5ddf925e923e706e5355dc1980$9a87f1271b3d29152f1d7fef3f3d27975785c54514b2d80690a08be5605ba425be49378ba21f68ef0d0bf8991953298353e67ca940064fa4895be205daa11a4c',
   'Pat Manager', 'manager', 1, true, 1)
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
