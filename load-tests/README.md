# Load tests (Artillery)

Concurrent-load tests for the API, as the brief asks: "Test API endpoints under high concurrent load using tools like Artillery or JMeter". The results and what they mean are in [docs/load-testing.md](../docs/load-testing.md).

| File | What it simulates | Where to run it |
|---|---|---|
| `api-read.yml` | Read-heavy: the four personas sign in and use their main screens at once.<br>Employee 40%, engineer 25%, manager 20%, admin 15%. | local or cloud (read-only) |
| `api-write.yml` | Employees reporting incidents and adding notes | **local only** (creates incidents) |
| `summarise.py` | Turns a result file into the markdown tables used in `docs/` | anywhere (standard library) |

Every virtual user signs in for real, so each sign-in runs the scrypt password check. They then make three or four requests about a second apart.

## Run

```bash
cd load-tests
npx npm@11 install                       # Artillery, pinned in package.json

# Local (LocalStack via the dev proxy on :3001; start it with ./bin/start-dev.sh)
LOAD_PASSWORD='Password123!' npx artillery run -e local --output results/local-read.json api-read.yml
LOAD_PASSWORD='Password123!' npx artillery run -e local --output results/local-write.json api-write.yml
./bin/init-db.sh --reset                 # from the repo root: remove the incidents the write test created

# Cloud (read-only). LOAD_PASSWORD is the SEED_PASSWORD secret; type it in your own shell, never commit it.
LOAD_PASSWORD='...' npx artillery run -e cloud --target https://<cloudfront-domain> \
  --output results/cloud-read.json api-read.yml

# Cloud stress (read-only): one-minute steps up to 40 new users a second, to find the limit.
# Don't run it close to a demo.
LOAD_PASSWORD='...' npx artillery run -e stress --target https://<cloudfront-domain> \
  --output results/cloud-stress.json api-read.yml

python3 summarise.py results/cloud-read.json              # markdown tables for docs/load-testing.md
python3 summarise.py --timeline results/cloud-stress.json # plus one row per 10 s, to see where it bends
```

## Pass criteria

Each file has checks that make Artillery exit non-zero when they fail:

- p95 response time under 3 s across all requests;
- under 1% of virtual users failing.

## Profiles

- **local** runs one new user a second for two minutes. That is the sustainable baseline for LocalStack on a development machine. LocalStack runs each concurrent request in its own Docker container, so it saturates at a few new users a second (see the docs).
- **cloud** ramps from 1 to 10 new users a second over a minute, then holds 10 a second for two minutes. That is about 30–40 requests a second against real Lambda, CloudFront and Aurora.
- **stress** steps up 5, 10, 20 and 40 new users a second, a minute each, reaching about 160 requests a second. Its checks are expected to fail at the top. The point is to see where latency bends and which errors appear first: Lambda throttling, timeouts or database limits.
