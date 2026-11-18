-- Shared database schema, in dependency order.
-- Never edit an existing CREATE TABLE; append changes as ALTER TABLE ... IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS teams (
  id   serial PRIMARY KEY,
  name text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  email         text UNIQUE NOT NULL CHECK (email LIKE '%@acme.inc'),
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('employee','engineer','admin')),
  team_id       int REFERENCES teams,          -- engineers only
  is_available  boolean DEFAULT true,          -- engineers only
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buildings (id serial PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS floors    (id serial PRIMARY KEY, building_id int NOT NULL REFERENCES buildings, name text NOT NULL);
CREATE TABLE IF NOT EXISTS seats     (id serial PRIMARY KEY, floor_id int NOT NULL REFERENCES floors, code text NOT NULL);

CREATE TABLE IF NOT EXISTS categories (
  id   serial PRIMARY KEY,
  name text NOT NULL,
  type text CHECK (type IN ('facility','technology'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id             serial PRIMARY KEY,
  title          text NOT NULL,
  description    text,
  category_id    int REFERENCES categories,
  building_id    int NOT NULL REFERENCES buildings,
  floor_id       int REFERENCES floors,
  seat_id        int REFERENCES seats,
  reporter_id    int NOT NULL REFERENCES users,
  assignee_id    int REFERENCES users,
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','in_progress','blocked','resolved','closed')),
  priority       text NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low','medium','high','critical')),
  is_escalated   boolean DEFAULT false,
  blocked_reason text,
  escalation_reason text,
  created_at      timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  assigned_at     timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz
);

CREATE TABLE IF NOT EXISTS incident_notes (
  id          serial PRIMARY KEY,
  incident_id int NOT NULL REFERENCES incidents ON DELETE CASCADE,
  author_id   int NOT NULL REFERENCES users,
  body        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
