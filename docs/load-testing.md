# Load testing

The brief asks for "Load Testing: Test API endpoints under high concurrent load using tools like Artillery or JMeter" and "Performance Monitoring: Monitor response times and resource usage". This page records how we tested, what we measured and what it means. The scenarios and run instructions are in [load-tests/](../load-tests/README.md).

## Summary

| Run | Load | Result |
|---|---|---|
| Local baseline, read | 1 new user/s, about 5 req/s, 2 min | ✅ **median 21 ms, p95 66 ms**, 0.8% failed (one LocalStack hiccup) |
| Local baseline, write | 1 new user/s, about 5 req/s, 80 s | ✅ **median 20 ms, p95 59 ms**, 0 failed, 80 incidents and 80 notes created |
| Local saturation | ramp to 4 new users/s | ❌ 78% of users failed. LocalStack, not the app, ran out of capacity (see below) |
| Cloud, sustained | ramp to 10 new users/s, **44 req/s** held for 2 min | ✅ **6,885 requests, 0 errors.** Median 21 ms; p95 180 ms (sign-in); p99 187 ms |
| Cloud, stress | steps 5, 10, 20, 40 new users/s, **up to 176 req/s** | ✅ **20,074 requests, 0 errors.** Median 19 ms; p95 180 ms (sign-in); flat at every step |

**Takeaways**
- **The application code is fast.** Every endpoint answers in about 20 ms at the median, including the dashboards' aggregate queries (medians and recurring-hotspot subqueries over about 300 incidents) and writes that insert an incident and its audit event in one transaction.
- **Sign-in is the slowest call, on purpose.** It runs an scrypt password hash (about 50 ms locally, about 170 ms on a 512 MB Lambda) so stolen password hashes are expensive to crack.
- **The local ceiling is the emulator.** On a 2-CPU development machine, LocalStack collapses at a few new users a second, because every concurrent request gets its own Docker container. Capacity has to be measured in the cloud.
- **The cloud didn't bend at 176 requests a second,** about 100 times ACME's likely peak. Latency was flat at every step from 22 to 176 requests a second, with no errors, no throttling and no database slowdown. We didn't find the limit: by Little's law, that load only keeps about 10 Lambda executions busy at once.
- **Cold starts are the one slow spot.** After the app has been idle, the first requests take seconds while Lambda starts containers and Aurora resumes from auto-pause. Warm it up before a demo.

## How the tests work

- **Tool:** [Artillery](https://www.artillery.io/) 2.0.34, pinned in `load-tests/package.json`.
- **Real users, real sign-in.** Every virtual user signs in with a seeded account, a real scrypt check that returns a JWT. It then makes 3–4 requests about a second apart, as a person clicking through the app would.
- **Persona mix (`api-read.yml`):**
  - employee 40%: my incidents, detail, notes, report-form categories;
  - engineer 25%: team queue, team dashboard, own dashboard;
  - manager 20%: team dashboard, assign list, escalated incidents;
  - admin 15%: location hotspots, engineer profiles, search.
- **Writes (`api-write.yml`, local only):** employees run the duplicate check, report an incident, add a note and open it.
- **Pass criteria, enforced by Artillery's `ensure` checks:** p95 under 3 s, and under 1% of virtual users failing.
- **Numbers** come straight from Artillery's JSON output via `load-tests/summarise.py`. The raw results are in `load-tests/results/`.

**Test environment (local):** 2 vCPUs and 7 GB RAM. LocalStack Pro (dev image) emulates Lambda through the dev proxy on `:3001`, with PostgreSQL 18 on the same machine and the bulk seed loaded (294 incidents, 27 users).

## Local baseline: read (`results/local-read.json`)

Run started 2026-11-19 20:54 UTC, 120 s of traffic.

| Virtual users | Failed users | Requests | Throughput | Status codes | Errors |
|---|---|---|---|---|---|
| 120 | 1 (0.8%) | 527 | 4.4 req/s | 200: 525, 500: 1 | ERR_SOCKET_TIMEOUT: 1 |

| Request | Count | Median (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---|---|---|---|---|---|
| **All requests** | 526 | 21 | 66 | 120 | 21,026 |
| assign list (engineers) | 24 | 22 | 62 | 89 | 106 |
| engineer dashboard | 34 | 19 | 32 | 33 | 59 |
| engineer profiles | 12 | 16 | 23 | 23 | 25 |
| escalated incidents | 24 | 19 | 44 | 56 | 63 |
| incident detail | 49 | 17 | 49 | 56 | 61 |
| incident notes | 49 | 17 | 41 | 51 | 66 |
| location hotspots | 12 | 27 | 33 | 33 | 33 |
| my incidents | 49 | 20 | 49 | 59 | 83 |
| report form categories | 49 | 18 | 67 | 82 | 95 |
| search incidents | 12 | 20 | 21 | 21 | 23 |
| sign in | 120 | 52 | 91 | 153 | 1,671 |
| team dashboard | 58 | 18 | 59 | 86 | 321 |
| team queue (open) | 34 | 19 | 56 | 120 | 21,026 |

Over time, in 10-second windows:

| Time (s) | New users/s | Requests/s | Median (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Errors |
|---|---|---|---|---|---|---|---|---|
| 0 | 1.4 | 2.3 | 153 | 153 | 153 | 0 | 0 | 0 |
| 2 | 1.0 | 4.4 | 26 | 62 | 321 | 0 | 0 | 0 |
| 13 | 1.1 | 4.7 | 20 | 56 | 57 | 0 | 0 | 0 |
| 23 | 1.1 | 5.0 | 21 | 59 | 78 | 0 | 1 | 1 |
| 33 | 1.1 | 5.0 | 44 | 95 | 107 | 0 | 0 | 0 |
| 43 | 1.1 | 4.8 | 19 | 54 | 59 | 0 | 0 | 0 |
| 53 | 1.1 | 4.8 | 20 | 53 | 59 | 0 | 0 | 0 |
| 63 | 1.1 | 4.9 | 19 | 56 | 82 | 0 | 0 | 0 |
| 73 | 1.1 | 4.8 | 20 | 67 | 86 | 0 | 0 | 0 |
| 83 | 1.1 | 4.8 | 22 | 53 | 65 | 0 | 0 | 0 |
| 93 | 1.1 | 4.8 | 20 | 59 | 69 | 0 | 0 | 0 |
| 103 | 1.1 | 4.9 | 18 | 53 | 55 | 0 | 0 | 0 |
| 113 | 1.0 | 4.8 | 19 | 52 | 55 | 0 | 0 | 0 |

- **The first ~12 seconds are cold starts.** p99 reaches 321 ms while LocalStack starts the Lambda containers. After that, p99 stays at or under 107 ms.
- **The only failure** was one request that timed out after 21 s, plus one 500, both in the 23-second window. Timeouts aren't counted in latency, so they don't show in p99. At that moment LocalStack's own logs show its internal store failing ("database is locked" while saving Lambda logs). Our services logged no errors.

## Local baseline: write (`results/local-write.json`)

Run started 2026-11-19 21:00 UTC, 80 s of traffic.

| Virtual users | Failed users | Requests | Throughput | Status codes | Errors |
|---|---|---|---|---|---|
| 80 | 0 (0.0%) | 400 | 5.0 req/s | 200: 240, 201: 160 | none |

| Request | Count | Median (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---|---|---|---|---|---|
| **All requests** | 400 | 20 | 59 | 100 | 128 |
| add note | 80 | 20 | 32 | 67 | 82 |
| duplicate check | 80 | 19 | 46 | 76 | 85 |
| incident detail | 80 | 15 | 23 | 37 | 42 |
| report incident | 80 | 20 | 50 | 61 | 79 |
| sign in | 80 | 53 | 100 | 111 | 128 |

Writes cost about the same as reads. Reporting an incident validates the location against database constraints and writes the incident plus its `created` event in one transaction, at 20 ms median.

## Local saturation: where LocalStack gives up

An earlier local run ramped to 4 new users a second, about 15–20 requests a second, over 140 s:

| Virtual users | Failed users | Requests | Status codes | Errors | Median | p95 | p99 |
|---|---|---|---|---|---|---|---|
| 410 | 321 (78%) | 1,151 | 200: 824, 502: 30, 500: 6, 404: 1 | socket timeout (30 s): 290 | 15.5 s | 25.6 s | 27.7 s |

What happened:
- LocalStack started a new Lambda container for each concurrent request, reaching **147 containers** on 2 CPUs.
- The machine's load average reached **46**, and requests queued until they timed out.
- The same handlers answer in milliseconds when called directly (see the integration tests) and when LocalStack isn't saturated (the baseline above).

So this is the limit of local emulation, not of the application. It's why the local profile now stays at one new user a second. (The raw JSON for this run wasn't kept; the figures come from Artillery's printed summary.)

## Cloud: stress (`results/cloud-stress.json`)

Against the deployed stack: CloudFront, then Lambda (512 MB, Python 3.13), then Aurora PostgreSQL Serverless v2, with the bulk seed loaded. Run from a machine about 1–3 ms from CloudFront, so these are server-side times. Real users add their own network round trip.

Run started 2026-11-19 21:26 UTC, 272 s of traffic.

| Virtual users | Failed users | Requests | Throughput | Status codes | Errors |
|---|---|---|---|---|---|
| 4,560 | 0 (0.0%) | 20,074 | 73.9 req/s | 200: 20,074 | none |

| Request | Count | Median (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---|---|---|---|---|---|
| **All requests** | 20,074 | 19 | 180 | 187 | 1,049 |
| assign list (engineers) | 890 | 17 | 25 | 32 | 126 |
| engineer dashboard | 1,172 | 19 | 27 | 38 | 75 |
| engineer profiles | 664 | 17 | 25 | 41 | 68 |
| escalated incidents | 890 | 17 | 23 | 30 | 55 |
| incident detail | 1,834 | 16 | 22 | 29 | 65 |
| incident notes | 1,834 | 18 | 25 | 32 | 91 |
| location hotspots | 664 | 24 | 33 | 43 | 225 |
| my incidents | 1,834 | 19 | 27 | 36 | 234 |
| report form categories | 1,834 | 17 | 24 | 32 | 983 |
| search incidents | 664 | 19 | 27 | 36 | 77 |
| sign in | 4,560 | 172 | 187 | 206 | 1,039 |
| team dashboard | 2,062 | 20 | 29 | 38 | 1,049 |
| team queue (open) | 1,172 | 18 | 24 | 34 | 1,023 |

Over time (each step lasts a minute):

| Time (s) | New users/s | Requests/s | Median (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Errors |
|---|---|---|---|---|---|---|---|---|
| 0 | 2.3 | 4.7 | 183 | 191 | 191 | 0 | 0 | 0 |
| 1 | 2.0 | 9.0 | 26 | 183 | 983 | 0 | 0 | 0 |
| 11 | 2.1 | 8.5 | 22 | 183 | 187 | 0 | 0 | 0 |
| 21 | 2.6 | 10.1 | 22 | 180 | 183 | 0 | 0 | 0 |
| 31 | 5.0 | 22.5 | 21 | 183 | 187 | 0 | 0 | 0 |
| 41 | 5.0 | 22.2 | 22 | 183 | 183 | 0 | 0 | 0 |
| 51 | 5.0 | 21.4 | 21 | 183 | 187 | 0 | 0 | 0 |
| 61 | 5.0 | 22.2 | 20 | 180 | 183 | 0 | 0 | 0 |
| 71 | 5.0 | 22.7 | 21 | 169 | 187 | 0 | 0 | 0 |
| 81 | 5.9 | 24.9 | 20 | 176 | 187 | 0 | 0 | 0 |
| 91 | 10.0 | 43.8 | 21 | 176 | 187 | 0 | 0 | 0 |
| 101 | 10.0 | 44.1 | 21 | 180 | 191 | 0 | 0 | 0 |
| 111 | 10.0 | 43.4 | 20 | 172 | 183 | 0 | 0 | 0 |
| 121 | 10.0 | 43.5 | 21 | 172 | 180 | 0 | 0 | 0 |
| 131 | 10.0 | 43.8 | 20 | 172 | 183 | 0 | 0 | 0 |
| 141 | 11.8 | 48.8 | 19 | 176 | 191 | 0 | 0 | 0 |
| 151 | 20.0 | 87.4 | 19 | 176 | 183 | 0 | 0 | 0 |
| 161 | 20.0 | 88.7 | 19 | 176 | 183 | 0 | 0 | 0 |
| 171 | 20.0 | 87.7 | 19 | 176 | 183 | 0 | 0 | 0 |
| 181 | 20.0 | 88.4 | 19 | 176 | 183 | 0 | 0 | 0 |
| 191 | 20.0 | 87.1 | 19 | 176 | 187 | 0 | 0 | 0 |
| 201 | 23.6 | 97.7 | 18 | 180 | 194 | 0 | 0 | 0 |
| 211 | 40.0 | 176.4 | 18 | 176 | 183 | 0 | 0 | 0 |
| 221 | 40.0 | 176.1 | 19 | 180 | 191 | 0 | 0 | 0 |
| 231 | 40.0 | 177.2 | 19 | 180 | 187 | 0 | 0 | 0 |
| 241 | 40.0 | 176.2 | 19 | 180 | 187 | 0 | 0 | 0 |
| 251 | 40.0 | 176.3 | 19 | 180 | 191 | 0 | 0 | 0 |
| 261 | 32.9 | 158.4 | 19 | 180 | 187 | 0 | 0 | 0 |
| 271 | 0.0 | 7.0 | 18 | 21 | 21 | 0 | 0 | 0 |

What it shows:
- **No knee.** Throughput rose about 20-fold (9 to 176 requests a second) while the median stayed at 18–22 ms and p99 at 180–194 ms. There were no 4xx or 5xx responses and no timeouts.
- **Every screen is fast.** Excluding sign-in, every request has a median of 16–24 ms and a p99 of 29–43 ms. The heaviest is the admin's location hotspots, which ranks recurring issues across buildings, floors and seats (24 ms median).
- **The p95 of about 180 ms is sign-in.** Sign-ins are about 23% of requests and take about 172 ms each, because the scrypt password check is deliberately slow (it makes stolen password hashes expensive to crack). Without sign-in, p95 would be under 35 ms.
- **The limit is still well above this.** By Little's law, 176 requests a second at about 20 ms (and about 170 ms for sign-in) is roughly 10 Lambda executions at once. That's far below Lambda's concurrency limits, and only about 10 Aurora connections, one per warm container. A real ceiling test needs several times this load from more than one machine; one 2-CPU machine running Artillery is near its own limit at this rate.
- **Check: every route was real.** CloudFront serves the app's `index.html` with a 200 for any 404, so a mistyped API route would look like a fast success. Every URL in the test was checked to return JSON from the API (401 without a token), not HTML.

## Cloud: sustained (`results/cloud-read.json`)

A ramp from 1 to 10 new users a second over a minute, then 10 a second held for two minutes: the realistic busy-day profile, at about 20 times ACME's likely peak.

Run started 2026-11-19 21:32 UTC, 211 s of traffic.

| Virtual users | Failed users | Requests | Throughput | Status codes | Errors |
|---|---|---|---|---|---|
| 1,560 | 0 (0.0%) | 6,885 | 32.6 req/s | 200: 6,885 | none |

| Request | Count | Median (ms) | p95 (ms) | p99 (ms) | Max (ms) |
|---|---|---|---|---|---|
| **All requests** | 6,885 | 21 | 180 | 187 | 247 |
| assign list (engineers) | 305 | 17 | 24 | 28 | 34 |
| engineer dashboard | 383 | 22 | 29 | 35 | 40 |
| engineer profiles | 227 | 18 | 27 | 36 | 66 |
| escalated incidents | 305 | 17 | 22 | 26 | 40 |
| incident detail | 645 | 17 | 23 | 28 | 55 |
| incident notes | 645 | 18 | 25 | 31 | 45 |
| location hotspots | 227 | 26 | 33 | 39 | 52 |
| my incidents | 645 | 20 | 28 | 38 | 77 |
| report form categories | 645 | 18 | 24 | 29 | 48 |
| search incidents | 227 | 19 | 25 | 30 | 42 |
| sign in | 1,560 | 172 | 187 | 206 | 247 |
| team dashboard | 688 | 23 | 33 | 44 | 75 |
| team queue (open) | 383 | 18 | 25 | 35 | 85 |

Over time:

| Time (s) | New users/s | Requests/s | Median (ms) | p95 (ms) | p99 (ms) | 4xx | 5xx | Errors |
|---|---|---|---|---|---|---|---|---|
| 0 | 1.0 | 1.0 | — | — | — | 0 | 0 | 0 |
| 0 | 1.0 | 4.5 | 29 | 176 | 194 | 0 | 0 | 0 |
| 10 | 1.0 | 4.5 | 23 | 172 | 176 | 0 | 0 | 0 |
| 20 | 1.0 | 4.3 | 28 | 176 | 191 | 0 | 0 | 0 |
| 30 | 1.8 | 7.2 | 24 | 172 | 187 | 0 | 0 | 0 |
| 40 | 3.4 | 14.9 | 22 | 183 | 194 | 0 | 0 | 0 |
| 50 | 5.0 | 21.0 | 22 | 176 | 187 | 0 | 0 | 0 |
| 60 | 6.4 | 27.9 | 23 | 183 | 198 | 0 | 0 | 0 |
| 70 | 7.9 | 34.8 | 21 | 180 | 187 | 0 | 0 | 0 |
| 80 | 9.5 | 42.0 | 21 | 180 | 194 | 0 | 0 | 0 |
| 90 | 10.0 | 44.2 | 20 | 180 | 183 | 0 | 0 | 0 |
| 100 | 10.0 | 44.5 | 21 | 180 | 183 | 0 | 0 | 0 |
| 110 | 10.0 | 44.0 | 20 | 180 | 187 | 0 | 0 | 0 |
| 120 | 10.0 | 44.0 | 21 | 180 | 183 | 0 | 0 | 0 |
| 130 | 10.0 | 44.0 | 20 | 180 | 183 | 0 | 0 | 0 |
| 140 | 10.0 | 44.0 | 20 | 180 | 183 | 0 | 0 | 0 |
| 150 | 10.0 | 44.9 | 19 | 180 | 183 | 0 | 0 | 0 |
| 160 | 10.0 | 43.8 | 19 | 180 | 183 | 0 | 0 | 0 |
| 170 | 10.0 | 45.0 | 20 | 180 | 194 | 0 | 0 | 0 |
| 180 | 10.0 | 43.6 | 21 | 180 | 183 | 0 | 0 | 0 |
| 190 | 10.0 | 43.5 | 22 | 180 | 191 | 0 | 0 | 0 |
| 200 | 8.9 | 42.0 | 19 | 176 | 180 | 0 | 0 | 0 |
| 210 | 0.0 | 7.0 | 20 | 24 | 24 | 0 | 0 | 0 |

- **Steady throughout.** At 44 requests a second the median stayed at 19–22 ms and p99 at 183–194 ms, with no errors. Every non-sign-in request had a p99 under 45 ms.
- **The same latency as the stress run.** That's consistent with the stress result: this load is far from any limit.
- **A failed first attempt.** It used a password that didn't match the cloud accounts, so all 1,560 sign-ins were refused (401) and no user journey ran. It still timed sign-in, because a refused sign-in runs the same scrypt check: after about 25 cold seconds (up to 15.6 s per request while Lambda started containers and Aurora resumed from auto-pause), sign-in held a median of 162–166 ms with no 5xx errors.

## Performance monitoring

- **Client side:** Artillery records every response time (overall and per named request), status codes and errors, in 10-second windows. `summarise.py --timeline` turns those windows into the table that shows where latency bends.
- **Cold starts:** the only slow requests in any cloud run came after the app had been idle (seconds, not milliseconds), while Lambda starts containers and Aurora resumes from auto-pause. Before a demo, open the site and click through each persona once to warm it, or raise Aurora's minimum capacity so it doesn't pause.
- **Server side, cloud:** each Lambda's duration, cold starts (`Init Duration`) and errors are in CloudWatch: `aws logs tail /aws/lambda/<function> --follow`, plus the Lambda console metrics (duration, concurrent executions, throttles). Aurora's capacity and connections are in the RDS console.
- **Server side, local:** `docker stats` shows LocalStack's per-container CPU and memory. That's how the 147-container saturation above was spotted.
