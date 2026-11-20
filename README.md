# ACME Facility Incidents

A web app for reporting and fixing problems in ACME's offices, built for the coding workshop. This guide covers what it does, how it's built, how to run and test it, and the decisions I made along the way. The sections after [Known gaps](#known-gaps) go deeper into the cloud setup, the demo data, engineer profiles and the integration and load tests.

**Jump to:** [What it does](#what-it-does) · [Who can do what](#who-can-do-what) · [How it's built](#how-its-built) · [Run it on your machine](#run-it-on-your-machine) · [Tests](#tests) · [Deploying](#deploying) · [Decisions and trade-offs](#decisions-and-trade-offs) · [Assumptions](#assumptions) · [Known gaps](#known-gaps) · [Cloud deployment](#cloud-deployment-aws) · [Demo data](#demo-data-bulk-seed)

## What it does

ACME's offices have problems: broken printers, bad Wi-Fi, a leaking kitchen tap. Before this app, people reported them by email or chat and nobody had the full picture. This app gives everyone one place to report a problem, follow it, and fix it.

- **Employees** report a problem (we call it an *incident*), say where it is (building, floor, seat), and follow its progress. They can add notes, ask for it to be escalated, and rate the work once it's fixed.
- **Engineers** see their team's queue, take or get assigned incidents, move them through the workflow, and talk to the reporter through notes.
- **Managers** run a team: they assign work, see the team dashboard and workload, and handle escalations.
- **The admin** (the facility admin from the brief) sees everything: every incident, every team, buildings and seats, and engineer profiles.

### The pages

| Page | Who sees it | What's on it |
|---|---|---|
| **Sign in** (`/`) | Everyone | Email and password. Staff land on the dashboard, employees on their own incidents. |
| **My incidents** | Everyone | What I reported and what's assigned to me, as a board with a column per status. Cards can be dragged between columns. |
| **Report an incident** | Everyone | Category, building, floor and seat picked by name. It warns when a similar incident is already open at the same place, so people don't report the same thing twice. The warning shows only each one's title, category and place, with no link, because the reporter may not be allowed to see it. |
| **Incidents** | Everyone (each sees only what they're allowed to) | Search and filters (status, priority, category, building, assignee, escalated). Filters are kept in the address, so a link can be shared or the page reloaded. |
| **Incident detail** | Anyone who can see the incident | A picture of the workflow, the actions this person is allowed to take, one timeline of notes and history, and the reporter's rating. |
| **Dashboard** | Engineers, managers, admin | Charts by status, priority and category; response times; who's working on what; escalated and blocked incidents. The admin can pick any team and also sees the buildings and seats with the most repeat problems. |
| **My dashboard** | Engineers | Their own workload and performance. |
| **Engineers** | Admin | Add engineers, edit them, mark them available or not, deactivate and reactivate them. |
| **Facilities** | Admin | Buildings, floors, seats and categories: add, edit, delete. |

### How an incident moves

```
Open ──► In progress ──► Resolved ──► Closed
              │  ▲            │
              ▼  │            └──► back to In progress (reopen)
            Blocked
Open ──► Closed (cancel)
```

- Work can only start once someone is assigned.
- Blocking, reopening and cancelling all need a reason, which shows in the timeline.
- Every change (status, assignment, escalation, edits) is recorded with who did it and when. That history is what the dashboards' response times are worked out from.
- A closed incident is locked: no more notes or edits.

## Who can do what

The server checks every request. The app only hides buttons a person can't use, so trying to get around the app gets refused by the server too.

| Action | Employee | Engineer | Manager | Admin |
|---|---|---|---|---|
| Report an incident | ✅ | ✅ | ✅ | ✅ |
| See incidents | Ones they reported | Their team's, plus their own | Their team's, plus their own | All |
| Add a note (until closed) | ✅ on ones they can see | ✅ | ✅ | ✅ |
| Edit an incident | Ones they reported, while still open | — | Their team's | All |
| Change status | — | When assigned to them | Their team's | All |
| Take an unassigned incident | — | In their own team | — | — |
| Assign or reassign | — | — | Their team's | All |
| Ask for escalation | Ones they reported | When assigned to them | Their team's | All |
| Clear an escalation | — | — | Their team's | All |
| Rate the work | Ones they reported, once resolved | — | Can read it | Can read it |
| Delete an incident | — | — | — | ✅ |
| Dashboards | — | Their team, and their own | Their team | Every team, plus location hotspots |
| Manage engineers and facilities | — | — | — | ✅ |

The employee column is really "the person who reported it". Anyone who reports an incident, whatever their role, can also edit it while it's still open, ask for it to be escalated, and rate the work once it's resolved.

Someone who isn't allowed to see an incident gets "not found", not "forbidden". That way the app doesn't even confirm the incident exists.

## How it's built

```
Browser ──► CloudFront ──┬──► S3: the React app (the pages)
                         └──► /api/auth        ─► Lambda ─┐
                              /api/incidents   ─► Lambda ─┼──► PostgreSQL (one database)
                              /api/facilities  ─► Lambda ─┤
                              /api/analytics   ─► Lambda ─┘
```

- **Frontend** (`frontend/`): React with Material UI. Each area of the app has its own folder in `src/features/`. Only one file (`src/api/client.js`) talks to the server.
- **Backend** (`backend/`): four small Python services, each deployed as its own AWS Lambda function:
  - **auth**: sign in, register, engineer profiles;
  - **incidents**: incidents, notes, history, assigning, escalation, feedback;
  - **facilities**: buildings, floors, seats, categories, teams;
  - **analytics**: the dashboard numbers.
- **Inside each service** the code is in three layers, so each file has one job:
  - `routes.py` lists the web addresses and who may call them;
  - `service.py` holds the rules (who can do what, what's valid);
  - `repository.py` holds the database queries.
- **Shared code** lives in `backend/_common/`: reading requests, sign-in tokens, the database connection, error messages, input checks and lookups more than one service needs. `bin/sync-common.sh` copies it into each service before running or deploying, because each Lambda has to be self-contained.
- **Database**: PostgreSQL. The tables are in `backend/_common/schema.sql` and the demo data is generated by `bin/generate_seed.py` (see [Demo data](#demo-data-bulk-seed)).
- **Cloud**: Terraform in `infra/` creates everything in AWS. GitHub Actions checks every push and deploys `main` (see [Deploying](#deploying)).

**Keeping it secure**
- Passwords are never stored, only a scrambled version (scrypt). Checking a password is slow on purpose, which makes stolen password data very hard to crack.
- After signing in, the browser gets a signed token that lasts 8 hours. Every request sends it, and the server checks it, the person's role and their team every time.
- Database queries never paste user input into the SQL text; values are always sent separately. That rules out SQL injection.
- An unexpected error is logged in full on the server, but the user only sees a plain "something went wrong" message, never internal details.

## Run it on your machine

You need the workshop machine (or one set up with `./bin/setup-environment.sh`; see the [Validation Guide](docs/validation.md)).

```bash
source ~/.bashrc
./bin/start-dev.sh
```

That one script starts PostgreSQL and LocalStack (a stand-in for AWS on your own machine), creates the tables and demo data, copies the shared backend code into each service, deploys the services locally and starts the app.

Then open **http://localhost:3000** and sign in with any demo account, for example `admin@acme.inc`, `morgan@acme.inc` (manager), `fred@acme.inc` (engineer) or `eve@acme.inc` (employee). Locally every password is `Password123!`.

| Want to… | Run |
|---|---|
| Start again with fresh demo data | `./bin/init-db.sh --reset` |
| Pick up backend code changes | `./bin/sync-common.sh`, then `./bin/start-dev.sh` again |
| Run only the app against the cloud API | See [Developing against the cloud](#developing-against-the-cloud) |

## Tests

| Kind | Where | How many | What it proves |
|---|---|---|---|
| Backend unit tests | `backend/<service>/tests/` | 448 (auth 110, incidents 226, facilities 83, analytics 29) | The rules work: who can do what, input checks, every workflow move, every error message. The database is faked, so they run in seconds, and a test that tries to reach a real database fails on purpose. |
| Backend integration tests | `backend/<service>/integration/` | 40 more | Real requests through each service against a real, freshly seeded PostgreSQL database. Nothing is faked. |
| Frontend tests | `frontend/tests/` | 160 | Each page shows the right things for each role, handles loading and errors, and sends the right requests. |
| Load tests | `load-tests/` | 5 runs | How fast it is with lots of people at once. See [docs/load-testing.md](docs/load-testing.md). |

**How to run them**

```bash
# Backend: one service at a time (unit tests need no database)
./bin/sync-common.sh
cd backend/incidents && pytest tests

# Backend: unit + integration tests with coverage (needs local PostgreSQL running)
cd backend/incidents && pytest tests integration --cov=service --cov=routes --cov=repository
# In auth, add --cov=common: the shared code is measured once, there, as CI does.

# Frontend
cd frontend && npm test
```

**Results.** Everything passes. How much of our own code the tests run through: **auth 96%, incidents 99%, facilities 98%, analytics 100%**. The shared code is measured once, in auth. CI fails any service under 80%.

**What CI checks on every push:** code style (ruff, eslint), a security scan of the Python code (bandit), that the demo data file matches its generator, that the database tables and demo data load cleanly twice in a row, every test above except load tests, the frontend build, Terraform formatting and validation, and an npm security audit.

## Deploying

- **Every push to any branch** runs the checks (CI).
- **Only `main` deploys** to AWS. A push to another branch stops after the checks, so it can never replace what's live. There's only one cloud environment, so this keeps the demo safe.
- To ship something: open a pull request, wait for green checks, merge it into `main`. The merge deploys, then a smoke test signs in and calls the API to make sure it really works.
- The deploy can also be started by hand from the Actions tab. It only deploys when started on `main`.

## Decisions and trade-offs

| I chose… | Because… | The cost |
|---|---|---|
| **Four small services** instead of one big one | Each area (sign-in, incidents, facilities, dashboards) can change and deploy on its own, and it matches the workshop's Lambda-per-service setup. | Shared code has to be copied into each service by a script. |
| **One shared database** | Incidents, people and places are closely linked: a dashboard needs all three at once. One database keeps those queries simple and the data consistent. | The services aren't fully independent; a change to a table can affect more than one. |
| **Dashboards worked out by the server**, in SQL | The numbers are right however many incidents there are, and the browser only downloads the answers. | More SQL to write and test, so every dashboard number is checked against a separate count in the integration tests. |
| **Engineers are deactivated, never deleted** | Incident history keeps their name and their work still counts. | The engineers list keeps growing; inactive engineers are shown greyed out. |
| **Ratings are private from the engineer** | People rate more honestly when the engineer won't see it. Managers and the admin use it for coaching. | Engineers don't get direct feedback in the app. |
| **Reports go to a team by category** | Choosing "Wi-Fi" sends it to Workplace Technology automatically. Employees don't need to know who does what. | Categories have to be set up with the right team by the admin. |
| **A warning about duplicates** before reporting | Repeat reports of the same printer clog the queue. | It only matches the same category, building and floor, so a slightly different report can still get through. |
| **The cloud database pauses when idle** | It costs nothing overnight. | The first request after a pause takes about 15 seconds. Warm the app up before a demo. |
| **Generated demo data with a version number** | About 300 realistic incidents over 120 days, so the dashboards have something real to show. Bumping the version resets the cloud data. | A reset wipes anything typed into the cloud since the last one. |
| **Slow password checks** | Stolen password data is very hard to crack. | Sign-in takes about 170 ms in the cloud, the slowest request in the app. |

## Assumptions

- **A manager role.** The brief names three personas (employee, facility admin, engineer). Real teams have a lead, so I added a manager who acts like an admin, but only for their own team.
- **Two teams:** Facilities, and Workplace Technology. Each engineer and manager belongs to one.
- **The facility admin is like a service account:** they see and can do everything, across all teams.
- **Only the person doing the work changes the status:** the assigned engineer, the team's manager or the admin. The reporter can't mark their own ticket resolved.
- **New sign-ups are employees** and need an `@acme.inc` email. Engineers are added by the admin.
- **Engineers can pick up unassigned work** in their own team ("Take it"), so a quiet queue doesn't need a manager to hand things out.

## Known gaps

What I knowingly left out, roughly in order of importance:

- **No register page in the app.** Registration works on the server (`POST /api/auth/register`, `@acme.inc` emails only) and is tested, but there's no page for it yet. New employees can't sign themselves up from the app.
- **No end-to-end browser tests.** The pieces are tested separately (unit, integration, frontend, load), but there's no test that clicks through the real app in a browser.
- **Signing out isn't instant everywhere.** A deactivated engineer can't sign in again, but if they were already signed in, that session can keep working for up to 8 hours, until their sign-in token runs out.
- **No emails or notifications.** Employees see progress when they open the app, not by email.
- **No live updates.** Other people's changes show after a reload or the next action, not as they happen.
- **No limit on sign-in attempts.** Someone could keep guessing passwords; the slow password check only slows them down.
- **Registration says when an email is already used.** That tells someone the account exists.
- **Slow first request after idle** (about 15 seconds while the cloud database wakes up).
- **One cloud environment.** There's no separate test site; `main` is what's live.

## Cloud Deployment (AWS)

The app runs in AWS in the workshop region (`eu-west-1`):

```
Browser ──► CloudFront ──┬─► S3                 React frontend
                         └─► /api/<service>*  ─► Lambda per service (auth, incidents, …) ──► Aurora PostgreSQL
```

### How it is deployed

Every push (any branch) runs `.github/workflows/deploy.yml`, but only `main` gets past step 1:

1. CI runs first (lint, tests, build). A red CI never deploys. On any branch other than `main`, the run stops here.
2. `./bin/deploy-backend.sh aws` applies Terraform (`infra/`): Lambdas, Aurora, CloudFront.
3. `./bin/deploy-frontend.sh aws` builds the frontend and uploads it to S3.
4. A smoke test loads the site, lists incidents, signs in as the seeded admin, and calls `/api/auth/me`.

There is **one** cloud environment, and it always runs what's on `main`. Pushing another branch can't change it.

GitHub settings it needs (Settings → Secrets and variables → Actions):

| Name | Kind | Value |
|---|---|---|
| `PARTICIPANT_CODE` | Secret | Workshop participant code (from the organisers' email) |
| `SEED_PASSWORD` | Secret | Password for the seeded demo users in the cloud |
| `EVENT_ID` | Variable | Workshop event id |
| `PARTICIPANT_ID` | Variable | Workshop participant id |
| `AWS_REGION` | Variable (optional) | Defaults to `eu-west-1` |

### Finding the app

The website URL is printed in the deploy job's summary. With AWS credentials (`./bin/setup-participant.sh`) you can also run:

```bash
terraform -chdir=infra output -raw website_url
```

### Signing in

The cloud database is only reachable from the Lambdas. On the first start, a Lambda creates the tables (`schema.sql`) and, if the database has no users, loads `seed.sql`. Every seeded account gets the `SEED_PASSWORD` secret as its password, never the local dev password. Without that secret nothing is seeded.

| Email | Role |
|---|---|
| `admin@acme.inc` | Admin |
| `morgan@acme.inc`, `pat@acme.inc` | Manager |
| `fred@acme.inc`, `tina@acme.inc`, `omar@acme.inc` | Engineer |
| `eve@acme.inc`, `sam@acme.inc` | Employee |

The data is only loaded again when the seed version goes up (see [Cloud: versioned reseed](#demo-data-bulk-seed)), so changing `SEED_PASSWORD` has no effect on existing accounts until the next reseed, which gives every seeded account the new password. New employees can register with an `@acme.inc` address through the API (`POST /api/auth/register`); there's no register page in the app yet (see [Known gaps](#known-gaps)).

### Developing against the cloud

Run the UI locally against the deployed API, with no LocalStack needed:

```bash
cd frontend
VITE_PROXY_TARGET=https://<cloudfront-domain> npm run dev:cloud   # http://localhost:3000
```

The Vite dev server forwards `/api/*` to CloudFront, so the browser stays same-origin (no CORS). To avoid passing the URL each time, put `VITE_PROXY_TARGET=...` in `frontend/.env.cloud.local`, which is gitignored. Backend changes reach the cloud when they're merged into `main`, which deploys them.

### Logs

Each service has its own Lambda, named `coding-workshop-<service>-<participant-id>`:

```bash
aws logs tail /aws/lambda/coding-workshop-auth-<participant-id> --follow --region eu-west-1
aws logs tail /aws/lambda/coding-workshop-incidents-<participant-id> --since 30m --region eu-west-1
```

Unexpected errors are logged with a stack trace. The API returns only a generic 500 message.

### Aurora pausing and demo day

Aurora Serverless v2 is set to `min_capacity = 0.0` (`infra/rds.tf`), so it pauses when idle and costs nothing. The first request after a pause can take about 15s while it resumes. The backend retries the database connection once, and the frontend shows an error with a retry option if a request still fails.

For a live demo, set `min_capacity = 0.5` in `infra/rds.tf` and push, so the database never pauses. Set it back to `0.0` afterwards.

### Troubleshooting deploys

| Error | Cause and fix |
|---|---|
| `Workshop API returned HTTP 403` | Wrong or missing `EVENT_ID`, `PARTICIPANT_ID` or `PARTICIPANT_CODE`. Without `EVENT_ID` the script falls back to a different event's API. |
| `PARTICIPANT_URL not found for event ID` | `EVENT_ID` does not match the workshop DNS record (stray spaces and newlines are stripped automatically). |
| `requested bucket from "us-east-1", actual location "eu-west-1"` | Wrong region. Set the `AWS_REGION` variable to the workshop region. |
| `Set the SEED_PASSWORD repository secret` | Add the secret; the cloud database is not seeded without it. |

## Demo data (bulk seed)

`backend/_common/seed.sql` is **generated** by `bin/generate_seed.py`; edit the script, not the SQL, then run:

```bash
python3 bin/generate_seed.py          # rewrite seed.sql (deterministic: same output every run)
./bin/init-db.sh --reset              # reload the local database with it
```

CI fails if `seed.sql` doesn't match the script (`python3 bin/generate_seed.py --check`).

**What's in it**

- 27 accounts. The demo accounts above keep their ids and emails. They are joined by:
  - engineers `priya.patel`, `liam.walsh` and `grace.kim` (Facilities);
  - engineers `ravi.shah` and `chloe.martin` (Workplace Technology);
  - 14 more employees (`aisha.khan`, `ben.carter`, …).

  All use `@acme.inc`. The local password is `Password123!`; in the cloud it is the `SEED_PASSWORD` secret.
- 3 buildings, 8 floors, 37 seats and 10 categories split between the two teams.
- 5 hand-written walkthrough incidents (#1–#5, one per status), then about 290 generated over 120 days.

**How the incidents are generated.** Each one is a full life story played forward to the present:
- reported, then assigned by the team manager;
- started, sometimes blocked, escalated or reopened;
- resolved and closed.

Whatever hasn't happened yet "now" decides its current status. That gives a realistic open backlog, unassigned tickets to triage, uneven workloads, real response-time medians, and ratings that differ per engineer. Timestamps are relative to `now()`, so the data never goes stale.

**Recurring hotspots** (for the admin's location view): the same category reported at the same place again and again.
- Wi-Fi at seat RA-G-01;
- the Floor 1 printer at seat 1-04;
- the Innovation Hub meeting room AV at seat IH-1-02;
- HQ Tower Floor 2 air con;
- the HQ Tower kitchen plumbing.

**Cloud: versioned reseed.**
- `seed.sql` starts with `-- seed-version: N`, and the database records the version it holds in `app_meta`.
- On a cold start, a Lambda seeds an empty database as before. It also **wipes and reloads** the demo data once when the database's version is older than the deployed `seed.sql` (or missing).
- It never downgrades.
- So to reset the cloud's demo data, bump `SEED_VERSION` in `bin/generate_seed.py`, regenerate, and deploy.
- **This deletes anything entered in the cloud since the last seed.**

## Engineer profiles (auth service)

The facility admin manages engineer profiles from **Engineers** (`/admin/engineers`), as the brief asks ("create engineer profiles"; "CRUD … engineer profiles"). These endpoints are admin only. Managers and other roles get 403.

| Endpoint | What it does |
|---|---|
| `GET /api/auth/engineers?team_id=` | Every engineer, deactivated ones too, with team, availability and open incidents. `team_id` is optional. |
| `POST /api/auth/engineers` | Create an engineer on a team with a temporary password (`name`, `email`, `password`, `team_id`). |
| `PATCH /api/auth/engineers/{id}` | Change `name`, `team_id` or `is_available`, or deactivate and reactivate with `is_active`. Only the fields sent change. |

- **Deactivated, never deleted.** Incident history keeps their name. A deactivated engineer can't sign in or be assigned incidents, and can be reactivated.
- **Open work first.** Deactivating an engineer, or moving them to another team, while they still hold open incidents returns 409: "Reassign their N open incidents first".
- **Availability** is what the assign dialog and the dashboards' workload view show.
- **Shared queries.** The engineer list and the open-work count live in `backend/_common/lookups.py`, also used by the incidents assign list. Updates go through one `update_row` helper in `backend/_common/db.py`, which quotes identifiers with psycopg's `sql` module, and every value is a parameter.

## Integration and load tests

### Integration tests (real PostgreSQL)
Each service has `backend/<service>/integration/`. These tests send requests through that service's real Lambda handler against a **real, freshly seeded database**, so nothing is faked: routing, auth, validation, SQL and database constraints all run. The unit tests in `tests/` keep faking the database, so they stay fast and need no server.

- **Their own databases.** Each service creates `acme_it_<service>`, dropping any old one, on the local Postgres server, and seeds it through the app's own cold-start path (`ensure_schema` loads `seed.sql`). The development database is never touched.
- **Shared setup.** `backend/integration_support.py` holds it: the fresh database, a request client, signed tokens for the seeded accounts, and direct SQL reads for checking what was really stored.
- **What they cover:**
  - sign-in, registration and engineer profiles, including the unique-email and role-team constraints;
  - the full incident workflow, with every timestamp and audit event;
  - scoping per role, filters, notes, escalation, feedback, duplicates and cascading deletes;
  - facilities CRUD and in-use 409s;
  - every dashboard number, checked against an independent SQL count.

```bash
./bin/sync-common.sh
cd backend/incidents && pytest tests integration --cov=service --cov=routes --cov=repository
# In auth, add --cov=common: the shared code is measured once, there, as CI does.
```

Coverage of our own code (unit and integration together) is auth 96%, incidents 99%, facilities 98% and analytics 100%. The SQL layer (`repository.py`) went from 52–65% with unit tests alone to 97–100%. CI's "Integration tests (real PostgreSQL)" job runs these and fails below 80%.

### Load tests (Artillery)
Artillery scenarios live in `load-tests/`. Each virtual user signs in for real and uses the main screens for their role. The results and analysis are in [docs/load-testing.md](docs/load-testing.md), and how to run them is in [load-tests/README.md](load-tests/README.md).
