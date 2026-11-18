# CLAUDE.md

Guidance for AI assistants in this repository. Read it fully before changing anything.

## How we work: small, concise increments

This is the most important rule.

- **One small change at a time.** One endpoint, one component, one table or one test file per step. Aim for under ~150 changed lines per step.
- **Plan first.** Before writing code, state in 2–4 lines what you will change and which files. Wait for approval before touching more than 2 files.
- **Follow existing patterns.** Read the nearest existing service or page and mirror it. Do not invent new abstractions, frameworks or layers.
- **No speculative code.** Build only what the current step needs. No "future-proofing", no unused helpers.
- **Keep it explainable.** The author must be able to explain every line in a live Q&A. Prefer plain, readable code over clever code.
- **Verify every step.** Run the relevant tests (or a curl check) after each change, and report the result honestly.
- **Then stop.** Suggest a commit message in conventional format (`feat(incidents): add status update endpoint`) and the next small step.

## Project

A **facility incident management platform** for ACME Inc., built for the Citi Coding Workshop on Citi's starter repo (`coding-workshop-participant`).

**Problem:** facility and workplace-technology issues are reported over email, chat and spreadsheets, so tickets are duplicated, slow and badly communicated. Employees can't track progress, admins lack visibility, and engineers can't manage their work consistently.

**Personas and roles** (the `role` value stored on each user):

| Role | Can do |
|---|---|
| `employee` | Register with an `@acme.inc` email; create incidents; see and track **their own** incidents; add notes to their **open** incidents; request escalation or a priority change |
| `engineer` | See incidents **assigned to them**; update status; add notes to communicate with the reporter |
| `manager` | Team lead (one team). **Permissions still to be decided**; until then a manager only acts as reporter/assignee like anyone else |
| `admin` | Facility admin. Manage buildings, floors, seats and categories; create engineer users (with a team); assign and reassign tickets; see and manage **every** ticket through its lifecycle; handle escalation requests |

**MVP:**

- [ ] Authentication (register with `@acme.inc` email, login) and role-based access control
- [ ] CRUD: incidents, facilities (building → floor → seat), engineer profiles, incident notes
- [ ] Incident workflow with statuses `open`, `in_progress`, `blocked`, `resolved`, `closed`
- [ ] Visual representation of the ticket workflow (status stepper or timeline on the incident page)
- [ ] A dashboard per persona (counts by status, priority and assignee)
- [ ] Search and filter
- [ ] Responsive design (mobile and desktop)

**The business questions the data must answer** (each maps to a dashboard tile or report):

1. Which incidents are open, and what is their status?
2. Which buildings, floors and seats have the most recurring issues?
3. How quickly are incidents acknowledged, assigned and resolved?
4. Which engineers are available, and how is work distributed?
5. What are the most common issue categories?
6. Which incidents are escalated or blocked, and why?
7. How well are employees informed about progress? (notes count, time to first engineer response)

**Assumptions** (keep in `README.md` → Assumptions, and add to them as decisions are made):

- One assignee (engineer) per incident.
- "Acknowledged" = the first time an incident leaves `open` or gets an engineer note, whichever is first.
- `blocked` and escalation both require a reason.
- Employees cannot delete incidents; they can close their own if no longer needed. Admins can delete.
- Engineer availability is the `is_available` flag on the engineer's `users` row, plus their count of active tickets.

## How this is assessed

Citi's rubric (`docs/full-stack.md`): five technical areas (Implementation, Design, Code, Testing, Experience) and three soft skills (Curious, Observant, Driven), each 1–10. Final = average of the technical average and the soft-skill average.

- **Implementation:** runs locally and in the cloud; full CRUD UI → DB; reproducible deploy.
- **Design:** intuitive, responsive, accessible UI; consistent styling; clean API contract.
- **Code:** organised by feature; validation and errors in both layers; linted; reusable.
- **Testing:** unit and integration tests on logic and API; frontend journeys and error states; results and gaps documented.
- **Experience:** easy setup from the README; trade-offs and assumptions explained; clear loading, success and error feedback.

Make decisions, assumptions and fixes visible in commits, the README and `AI_USAGE.md`.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Material UI, react-responsive, react-router-dom |
| Backend | Python 3.13 AWS Lambda functions, one per service; no web framework |
| Database | PostgreSQL via `psycopg` 3 (local Postgres; Aurora in the cloud) |
| Auth | JWT (PyJWT, HS256); passwords hashed with `hashlib.scrypt` |
| Infra | Terraform in `infra/`, deployed with scripts in `bin/` (LocalStack locally) |
| Tests | PyTest; Vitest + React Testing Library |

## Data model

One shared database. Each table is **owned (written) by one service**; others may read it.

| Table | Key columns | Owner |
|---|---|---|
| `teams` | id, name (unique), description, created_at. A department (Facilities, Workplace Technology...) | engineers |
| `categories` | id, name (unique), type (`facility`, `technology`), team_id → teams (required) | facilities |
| `users` | id, email (unique, lowercase, `@acme.inc`), password_hash, name, role (`employee`, `engineer`, `manager`, `admin`), team_id → teams, is_available, is_active, created_by → users, created_at | auth (engineer/manager rows: engineers) |
| `buildings` | id, name (unique) | facilities |
| `floors` | id, building_id → buildings, name; unique (building_id, name) | facilities |
| `seats` | id, floor_id → floors, code; unique (floor_id, code) | facilities |
| `incidents` | id, title, description, category_id (required), team_id (required, owning team), building_id (required), floor_id, seat_id, reporter_id (required), assignee_id → users (SET NULL), status, priority, is_escalated, escalation_reason, blocked_reason, created_at, updated_at, acknowledged_at, assigned_at, resolved_at, closed_at | incidents |
| `incident_notes` | id, incident_id (CASCADE), author_id → users, body (non-blank), created_at | incidents |
| `incident_events` | id, incident_id (CASCADE), actor_id → users (SET NULL), event_type (`created`, `status_changed`, `assigned`, `escalated`, `priority_changed`, `team_changed`), from_value, to_value, reason, created_at | incidents |

**Rules the database enforces** (map violations to field-level 400s, see `CONSTRAINT_ERRORS` in `incidents/service.py`):
- `users_team_matches_role`: engineers and managers have exactly one team; employees and admins have none.
- `incidents_floor_in_building` / `incidents_seat_on_floor`: composite FKs, so the floor must be in the building and the seat on the floor. `incidents_seat_needs_floor`: no seat without a floor.
- `incidents_blocked_has_reason` / `incidents_escalated_has_reason`: blocked and escalated incidents always carry their reason.
- Users are deactivated (`is_active = false`), never deleted, so history stays intact.

**Rules the backend enforces** (not expressible as constraints):
- `incidents.team_id` is set from the category's team on create (`team_changed` event if an admin moves it later).
- The assignee must be an active engineer **on the incident's team**.
- Every create, status, assignment, priority, escalation or team change writes an `incident_events` row **in the same transaction**. Events power the workflow timeline, the reasons history and the timing metrics; the reason on the incident row is only the current one.
- `updated_at` is set by the backend on every write.
- Timestamps (`acknowledged_at`, `assigned_at`, `resolved_at`, `closed_at`) are set by the backend when the transition happens, never by the client.
- Schema lives in `backend/_common/schema.sql` as `CREATE TABLE IF NOT EXISTS` in dependency order. Changes are **appended** as `ALTER TABLE ... IF NOT EXISTS`. Never edit an existing `CREATE TABLE`.
- Mock data lives in `backend/_common/seed.sql` (fixed ids, `ON CONFLICT DO NOTHING`, sequences reset afterwards), so it is safe to re-run. When the schema changes, update the seed too.

## Incident workflow

```
open ──► in_progress ──► resolved ──► closed
  │          │  ▲           │
  │          ▼  │           └──► in_progress   (reopened)
  │        blocked
  └──────────────────────────────► closed       (cancelled by reporter or admin)
```

| From → To | Who | Rule |
|---|---|---|
| open → in_progress | assigned engineer, admin | Must have an assignee |
| in_progress → blocked | assigned engineer, admin | `reason` required |
| blocked → in_progress | assigned engineer, admin | |
| in_progress → resolved | assigned engineer, admin | Sets `resolved_at` |
| resolved → closed | reporter, admin | Sets `closed_at` |
| resolved → in_progress | reporter, admin | Reopen; `reason` required |
| open → closed | reporter, admin | Cancel; `reason` required |

- Allowed transitions live in **one place**: a `TRANSITIONS` dict in the incidents service. Invalid transitions return **409** with a clear message.
- Assignment (admin only) sets `assigned_at`. Unassigned incidents stay `open`.
- Escalation: the reporter can request it (`is_escalated = true` + reason); an admin can raise priority or clear escalation. Both update the incident row and write an `escalated` / `priority_changed` event.
- Notes can be added while status is not `closed`.

## Services and API

All routes are prefixed `/api/<service>`. RESTful, JSON in and out.

| Service | Endpoints | Access |
|---|---|---|
| `auth` | `POST /register` (employees only, `@acme.inc` email), `POST /login`, `GET /me` | public; signed in |
| `facilities` | CRUD `/buildings`, `/floors?building_id=`, `/seats?floor_id=` | read: all; write: admin |
| `engineers` | CRUD `/engineers` (creates a `users` row with role `engineer`, a `team_id` and `is_available`; deactivate instead of delete), `/teams`, `?available=true` | read: admin (engineers see own); write: admin |
| `incidents` | `GET /incidents?status=&priority=&category_id=&building_id=&assignee_id=&q=&mine=true`, `POST`, `GET /{id}`, `PUT /{id}` (details), `DELETE /{id}` (admin); `POST /{id}/status`, `POST /{id}/assign`, `POST /{id}/escalate`, `GET POST /{id}/notes` | scoped per role (below) |
| `reports` | `GET /summary` (counts by status, priority, category, assignee), `GET /hotspots` (by building, floor, seat), `GET /timings` (avg acknowledge, assign and resolve times), `GET /workload` (per engineer) | admin; engineers and employees get their own scoped summary |

**Row-level scoping** (enforced in SQL `WHERE`, not just in the UI):

- `employee`: incidents where `reporter_id = me`.
- `engineer`: incidents where `assignee_id = my profile`.
- `admin`: all incidents.

Requesting an incident outside your scope returns **404** (do not reveal it exists).

## Architecture rules

### Backend

- **Layers per service** (`backend/incidents/` is the reference; copy it for new services):
  - `function.py`: Lambda entry only: `handle(event, "<service>", ROUTES)`.
  - `routes.py`: `ROUTES = [Route(method, path, service.fn, status=...)]`, with a comment above each route saying who may call it. `{id}` in a path matches an integer and arrives as `req.params["id"]`.
  - `service.py`: validation, rules and permissions. Takes a `Request`, returns data, raises `ApiError`s. No SQL, no HTTP.
  - `repository.py`: SQL only. No rules. Multi-step writes are wrapped by the service in `with transaction():`.
- **Shared code** in `backend/_common/` (`db.py`: `get_conn()`, `transaction()`, `ensure_schema()`; `errors.py`; `http.py`: `Request`, `Route`, `handle()`; `auth.py`: `hash_password`, `verify_password`, `issue_token`, `decode_token`, `require_role`; `schema.sql`), copied into each service as `common/` by `bin/sync-common.sh` (run by start-dev and deploy-backend; re-run after editing `_common`). The copies are gitignored; never edit them.
- **Errors:** raise `ApiError` subclasses (`BadRequest` 400, `Unauthorized` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409, `NotImplementedYet` 501 for stubs). Only `handle()` in `_common/http.py` turns them into responses. Body is always `{"error": {"message": str, "details": {field: message}}}`.
- **Status codes:** 200 read/update, 201 create, 204 delete, 400 validation, 401 not signed in, 403 wrong role, 404 not found/out of scope, 409 duplicate or invalid transition, 500 unexpected (logged, never exposed).
- **SQL:** always `%s` / `%(name)s` parameters, never f-strings. Use `RETURNING` on writes (0 rows → 404). Multi-step writes (e.g. status change + event) go in `with get_conn().transaction():`. Use `LEFT JOIN` for optional relations and `count(col)` after a LEFT JOIN.
- **Validation:** required fields, enum values, `@acme.inc` email, that referenced building/floor/seat/engineer exist **and belong together** (seat is on that floor, floor in that building). Return field-level 400s.
- **Auth first, then permission:** `handle()` authenticates every route unless it is declared `Route(..., public=True)` (only register and login). It reads `Authorization: Bearer <jwt>` and sets `req.user = {"id", "role", "team_id"}`, or returns 401. **Role access is declared on the route:** `Route(..., roles=("admin", "manager"))` returns 403 before the handler runs (roles are checked against `common.auth.ROLES` at import, so a typo fails at startup). **Record access is checked in the service** (own team, own incident) using `req.user`: 404 if out of scope, 403 if visible but not allowed. Tokens last 8h; role or deactivation changes apply at next login (`GET /auth/me` re-reads the DB). Frontend mirrors roles for UI only: `<RequireAuth roles={[...]}>` and `hasRole(user, ...)`.
- **Paths:** locally the Lambda sees `/12`; behind CloudFront it sees `/api/incidents/12`. `parse_request()` strips `api` and the service name, so route paths in `routes.py` are relative (`/{id}/status`).

### Frontend

- `src/api/client.js` is the **only** file that calls `fetch` (base URL from `import.meta.env.VITE_API_URL`, token header, `ApiError`, network errors).
- Organise by feature: `src/features/{auth,incidents,facilities,engineers,dashboard}/`. Shared UI in `src/components/`.
- Every data view handles **loading, error (with retry), empty and data**.
- Forms: required fields marked, validate before submit, server `details[field]` shown under the field, disabled while saving.
- Show and hide actions by role using `can(...)` from `AuthContext`. The backend is the real enforcement.
- Workflow visual: MUI `Stepper` for the main path plus a timeline of `incident_events`, with `blocked` and escalation highlighted.
- Status and priority shown as consistently coloured MUI `Chip`s (one mapping in `src/constants.js`).
- Responsive: `react-responsive` / MUI breakpoints; cards on phones, tables on desktop.
- One MUI theme in `theme.js`; labelled inputs; keyboard-accessible dialogs.

## Code style

**Python (`backend/**/*.py`):** snake_case for variables and functions, CamelCase for classes, PEP 8, type hints on parameters and return values, docstrings on all public modules, classes, functions and methods.

**JavaScript/React (`frontend/**/*.js,*.jsx,*.ts,*.tsx`):** camelCase for variables and functions, PascalCase for components and classes, Airbnb JavaScript Style Guide, PropTypes on every component, JSDoc on public functions and components.

**Terraform (`infra/*.tf,*.tfvars`):** snake_case resource and variable names, HCL conventions, comments on every resource and variable, modules for reusable parts, `terraform validate` before committing.

**Naming:** SQL tables plural snake_case; constraints `table_column_kind`; URLs plural nouns; branches `feature/<name>`.

## Commands

```bash
./bin/sync-common.sh                # copy _common into each service (start-dev and deploy-backend run it)
./bin/init-db.sh                    # apply schema + seed mock data locally (idempotent; also run by start-dev)
./bin/init-db.sh --reset            # drop app tables, then recreate and reseed
./bin/start-dev.sh                  # Postgres, LocalStack, Lambdas, proxy :3001, Vite :3000
mkdir backend/<service> && cp backend/incidents/{function,routes,service,repository}.py backend/incidents/requirements.txt backend/<service>/   # new service: then rename and strip, and restart start-dev
cd backend && pytest --cov          # backend tests (target ≥ 80%)
cd frontend && npx vitest run       # frontend tests
cd frontend && npm run lint
./bin/deploy-backend.sh             # AWS (slow first time: Aurora)
./bin/deploy-frontend.sh            # build, upload to S3, CloudFront URL
cd infra && terraform validate
psql -h localhost -U postgres       # local DB, password postgres123
AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566" aws logs tail /aws/lambda/<function-name> --follow --format short
```

Local Lambda DB settings (injected): host `172.17.0.1`, port 5432, db/user `postgres`, password `postgres123`. In the cloud use `sslmode=require` when `IS_LOCAL` is `false`.

## CI/CD

- `.github/workflows/ci.yml` (PRs, and called by deploy.yml on every push): ruff (`ruff.toml`), compile, pytest once `backend/<service>/tests` exist, schema + seed applied twice against Postgres 16, frontend lint/test/build, `terraform fmt -check` + `validate`, `bash -n` on `bin/*.sh`.
- `.github/workflows/deploy.yml` (every push on any branch, or manual): runs CI, then `deploy-backend.sh aws`, `deploy-frontend.sh aws`, and a smoke test (`GET /`, `GET /api/incidents`, sign in as the seeded admin with `SEED_PASSWORD`, then `GET /api/auth/me`). One deploy at a time; there is one cloud environment, so the latest push wins. Needs the `EVENT_ID` and `PARTICIPANT_ID` variables and the `PARTICIPANT_CODE` and `SEED_PASSWORD` secrets.
- Needs repo secrets `PARTICIPANT_ID`, `PARTICIPANT_CODE` (optional `PARTICIPANT_URL`) and repo variable `EVENT_ID`.
- Keep CI green locally before pushing: `ruff check backend`, `cd frontend && npm run lint && npm run build`, `terraform fmt -check -recursive infra`.

## Known repo gotchas

1. ~~`bin/proxy-server.js` drops the `Authorization` header.~~ Fixed: it now forwards it. Restart the proxy (or `start-dev.sh`) after pulling.
2. ~~No JWT secret is injected.~~ Fixed: `random_password.jwt` in `infra/main.tf` → `JWT_SECRET` in `env_vars`. Without it, `common/auth.py` falls back to a dev secret only when `IS_LOCAL=true`, and fails closed in the cloud.
3. Each Lambda ships only its own folder: run `bin/sync-common.sh` first, or `import common` fails.
4. `frontend/.env.sample` uses `REACT_APP_`; Vite needs `VITE_API_URL`. (Fixed.)
5. The cloud DB is only reachable from the Lambdas: tables are created by code on cold start (`ensure_schema()`), and seed data runs through a script or admin-only endpoint, never automatically.
6. Lambda deps are pip-installed into each service folder for hot reload. They must be wheels for the **Lambda runtime (python3.13, x86_64)**, not the host Python, or the import fails (`cannot import name 'pq' from psycopg_binary`). `start-dev.sh` passes `--python-version 3.13 --platform manylinux2014_x86_64 --only-binary=:all:`; use the same flags if installing by hand.
7. **Incidents still trust ids from the request:** the frontend signs in for real (`AuthProvider`, token in localStorage, `client.js` sends `Authorization` and signs out on a 401), but the incidents API still takes `?user_id=` on list, `reporter_id` on create and `actor_id` on status changes, filled from the signed-in user. Those routes stay `public=True` (`TODO(auth)`) until the incidents branch switches them to `req.user`. Seeded users all have the dev password `Password123!`.

## Testing

- Each endpoint: success, 400 (field names), 401, 403/404 for wrong role or out of scope, 404 not found, 409 (duplicates and **invalid status transitions**).
- The workflow: test every allowed transition and at least one forbidden transition per status; test that each change writes an `incident_events` row and sets its timestamp (and reason where required).
- Reports: seed known data and assert exact counts and averages.
- Frontend: incident form validation, role-based button visibility, status change, error and empty states. Mock `src/api/*`.
- Frontend tests live in `frontend/tests/`, mirroring `src/` (e.g. `tests/api/client.test.js` covers `src/api/client.js`); shared setup in `tests/setup.js`. Backend tests live in `backend/<service>/tests/`.
- Targets: 80%+ coverage backend and frontend; critical paths (register → create incident → assign → resolve → close) covered end to end.
- Record commands, results and known gaps in the README.

## Documentation to keep current

- `README.md`: what it does per persona, architecture, how to run and deploy, assumptions, decisions and trade-offs, testing results, known gaps, AI usage summary.
- `docs/PLAN.md`: MVP checklist and milestones (tick off as you go).
- `docs/API.md`: endpoints, roles and examples.
- `AI_USAGE.md`: when an AI suggestion is corrected (wrong query, security issue, wrong status code), add a row: what it suggested, the problem, the fix.

## Definition of done (per increment)

- [ ] Works locally end to end (or the endpoint passes curl checks)
- [ ] Validation and errors handled in backend and frontend
- [ ] Role and scope enforced in the backend
- [ ] Tests written and passing; lint clean
- [ ] README/PLAN updated if behaviour or assumptions changed
- [ ] Small commit with a clear conventional message