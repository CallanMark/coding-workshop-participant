# Coding Workshop

The goal of this coding workshop is to enable and assess the hands-on skills
of participants through development of a practical technical solution that
solves a theoretical business problem.

## Getting Started

Navigate to [Coding Workshop - Main Guide](./docs/README.md) to get started.

## Coding Workshop Example

Coding workshop organizer(s) will provide instructions to follow by email. Here
below is a real example of requirements and expectations for participant(s):

### Requirements: Business Problem

Our company ACME Inc. is going through a massive organizational transformation
to become a more data-driven organization. Information about teams structure
and performance is currently scattered across multiple systems, making it
difficult to get a comprehensive view of team dynamics and achievements.

We are struggling to answer simple questions like:

* Who are the members of each team?
* Where are the teams located?
* What are the key achievements of each team on a monthly basis?
* How many teams have team leader not co-located with team members?
* How many teams have team leader as a non-direct staff?
* How many teams have non-direct staff to employees ratio above 20%?
* How many teams are reporting to an organization leader?

### Requirements: Technical Solution

As part of this transformation, we are looking to build a centralized team
management tool that will allow us to track team members, team locations,
monthly team achievements, as well as individual-level and team-level metadata.
Initial focus is to provide a self-service capability without any integrations
with other tools such as Employee Directory, Project Tracking, or Performance
Management.

The technical solution involves developing a stand-alone web application using
modern technologies. The application will have the following features:

* User authentication and authorization
* Role-based access control
* CRUD operations for individuals, teams, achievements and metadata
* Search and filter functionality
* Responsive design for mobile and desktop usage

### Requirements: Technology Stack

The following technologies are required to build the application:

* Frontend: HTML, CSS, React.js with React Responsive and Material UI Components
* Backend: Python
* Database: PostgreSQL

The following technologies are good to know, as they are used to manage and
deploy code:

* Version Control: Git, GitHub
* Infrastructure: Terraform
* Deployment Mode: Shell Scripts
* Deployment Target: AWS Serverless (e.g. S3, CloudFront, Lambda, RDS)

### Expectations: Value-Based Outcomes

By the end of the workshop, participants will have developed a functional
web application that meets the requirements outlined above. The application
will be deployed to a cloud environment and accessible via a web browser.
Participants will also gain hands-on experience with modern web development
technologies and best practices.

## Contributing

See the [CONTRIBUTING](./CONTRIBUTING.md) resource for more details.

## License

This library is licensed under the MIT-0 License.
See the [LICENSE](./LICENSE) resource for more details.

## Roadmap

See the
[open issues](https://github.com/citi/coding-workshop-participant/issues)
for a list of proposed roadmap features (and known issues).

## Security

See the
[Security Issue Notifications](./CONTRIBUTING.md#security-issue-notifications)
resource for more details.

## Authors

The following people have contributed to this workshop:

* Colin Heilman - [@heilmancs](https://github.com/heilmancs)
* Eugene Istrati - [@eistrati](https://github.com/eistrati)
* Isaiah Cornelius Smith - [@corneliusmith](https://github.com/corneliusmith)
* Juan Arevalo - [@jparevalo27](https://github.com/jparevalo27)
* Michael Annucci - [@michael-annucci](https://github.com/michael-annucci)

## Feedback

We'd love to hear your feedback! Please:

* ⭐ Star the repository if you find it helpful
* 🐛 Report issues on GitHub
* 💡 Suggest improvements
* 📝 Share your experience

## Cloud Deployment (AWS)

The app runs in AWS in the workshop region (`eu-west-1`):

```
Browser ──► CloudFront ──┬─► S3                 React frontend
                         └─► /api/<service>*  ─► Lambda per service (auth, incidents, …) ──► Aurora PostgreSQL
```

### How it is deployed

Every push (any branch) runs `.github/workflows/deploy.yml`:

1. CI runs first (lint, tests, build). A red CI never deploys.
2. `./bin/deploy-backend.sh aws` applies Terraform (`infra/`): Lambdas, Aurora, CloudFront.
3. `./bin/deploy-frontend.sh aws` builds the frontend and uploads it to S3.
4. A smoke test loads the site, lists incidents, signs in as the seeded admin, and calls `/api/auth/me`.

There is **one** cloud environment, so the latest push wins. Before a demo, push only to `main`.

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

Seeding happens once: changing `SEED_PASSWORD` later does not change existing accounts. New employees can register with an `@acme.inc` address.

### Developing against the cloud

Run the UI locally against the deployed API, with no LocalStack needed:

```bash
cd frontend
VITE_PROXY_TARGET=https://<cloudfront-domain> npm run dev:cloud   # http://localhost:3000
```

The Vite dev server forwards `/api/*` to CloudFront, so the browser stays same-origin (no CORS). To avoid passing the URL each time, put `VITE_PROXY_TARGET=...` in `frontend/.env.cloud.local`, which is gitignored. Backend changes reach the cloud by pushing, which deploys them.

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
