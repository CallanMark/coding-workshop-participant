-- Shared database schema, in dependency order.
-- Never edit an existing CREATE TABLE; append changes as ALTER TABLE ... IF NOT EXISTS.

-- Departments (HVAC, IT, Electrical...). Each owns categories, engineers and tickets.
CREATE TABLE IF NOT EXISTS teams (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Each category is owned by exactly one team: the category routes the ticket.
CREATE TABLE IF NOT EXISTS categories (
  id      serial PRIMARY KEY,
  name    text NOT NULL UNIQUE,
  type    text NOT NULL CHECK (type IN ('facility', 'technology')),
  team_id int  NOT NULL REFERENCES teams ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '%@acme.inc'),
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('employee', 'engineer', 'manager', 'admin')),
  team_id       int REFERENCES teams ON DELETE RESTRICT,
  is_available  boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,          -- deactivate, never delete (history)
  created_by    int REFERENCES users ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- engineers and managers belong to exactly one team; employees and admins to none
  CONSTRAINT users_team_matches_role CHECK (
    (role IN ('engineer', 'manager') AND team_id IS NOT NULL) OR
    (role IN ('employee', 'admin')   AND team_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS buildings (
  id   serial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS floors (
  id          serial PRIMARY KEY,
  building_id int  NOT NULL REFERENCES buildings ON DELETE RESTRICT,
  name        text NOT NULL,
  UNIQUE (building_id, name),
  UNIQUE (id, building_id)                 -- target for the composite FK below
);

CREATE TABLE IF NOT EXISTS seats (
  id       serial PRIMARY KEY,
  floor_id int  NOT NULL REFERENCES floors ON DELETE RESTRICT,
  code     text NOT NULL,
  UNIQUE (floor_id, code),
  UNIQUE (id, floor_id)
);

CREATE TABLE IF NOT EXISTS incidents (
  id                serial PRIMARY KEY,
  title             text NOT NULL,
  description       text,
  category_id       int  NOT NULL REFERENCES categories,
  team_id           int  NOT NULL REFERENCES teams,     -- owning team, set from the category
  building_id       int  NOT NULL REFERENCES buildings,
  floor_id          int,
  seat_id           int,
  reporter_id       int  NOT NULL REFERENCES users,
  assignee_id       int  REFERENCES users ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'closed')),
  priority          text NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  is_escalated      boolean NOT NULL DEFAULT false,
  escalation_reason text,
  blocked_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_at   timestamptz,
  assigned_at       timestamptz,
  resolved_at       timestamptz,
  closed_at         timestamptz,
  -- the floor must be in the building, and the seat on the floor
  CONSTRAINT incidents_floor_in_building FOREIGN KEY (floor_id, building_id) REFERENCES floors (id, building_id),
  CONSTRAINT incidents_seat_on_floor     FOREIGN KEY (seat_id, floor_id)     REFERENCES seats (id, floor_id),
  CONSTRAINT incidents_seat_needs_floor  CHECK (seat_id IS NULL OR floor_id IS NOT NULL),
  CONSTRAINT incidents_blocked_has_reason   CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL),
  CONSTRAINT incidents_escalated_has_reason CHECK (NOT is_escalated OR escalation_reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS incident_notes (
  id          serial PRIMARY KEY,
  incident_id int  NOT NULL REFERENCES incidents ON DELETE CASCADE,
  author_id   int  NOT NULL REFERENCES users,
  body        text NOT NULL CHECK (length(trim(body)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Audit trail: workflow timeline, reasons, and the timing metrics.
CREATE TABLE IF NOT EXISTS incident_events (
  id          serial PRIMARY KEY,
  incident_id int  NOT NULL REFERENCES incidents ON DELETE CASCADE,
  actor_id    int  REFERENCES users ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN
              ('created', 'status_changed', 'assigned', 'escalated', 'priority_changed', 'team_changed')),
  from_value  text,
  to_value    text,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_team_idx          ON users (team_id);
CREATE INDEX IF NOT EXISTS incidents_team_status   ON incidents (team_id, status);
CREATE INDEX IF NOT EXISTS incidents_assignee_idx  ON incidents (assignee_id);
CREATE INDEX IF NOT EXISTS incidents_reporter_idx  ON incidents (reporter_id);
CREATE INDEX IF NOT EXISTS incidents_location_idx  ON incidents (building_id, floor_id, seat_id);
CREATE INDEX IF NOT EXISTS incident_notes_inc_idx  ON incident_notes (incident_id);
CREATE INDEX IF NOT EXISTS incident_events_inc_idx ON incident_events (incident_id, created_at);
