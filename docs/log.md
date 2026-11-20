- 10:12 I have desgined the database schema and came with a rough divide for the services (incidents,auth, faculty,analytics) , I may extend this to include a notifications service but later on but seems overkill for now. I plan on creating a fist slice with indicents  CRUD (without any auth) working e2e (frontend/backend) and then move on to auth/ login from there

## Wednesday 18 November

- 13:44 First slice is done: incidents can be listed, created and moved through the workflow end to end (frontend and backend), with a drag-and-drop board. No auth yet, that's next.
- 22:03 Auth service merged. People can register (acme.inc emails only) and sign in, passwords are hashed and every request needs a sign-in token by default. Routes can be limited to roles. Sign-in page and route guards on the frontend.
- 23:13 Cloud ready. The app deploys to AWS from GitHub Actions and the cloud database creates its tables and loads the demo data itself on first start. The demo password comes from a GitHub secret so it's never in the repo.

## Thursday 19 November

- 09:17 Incidents now trust the sign-in token instead of the request. The reporter comes from who's signed in, and each role only sees the incidents it should (employee: theirs, engineer and manager: their team, admin: everything).
- 10:40 Rest of the incident features: edit, delete, notes, assigning, escalation, priority, search and filters, and a history of every change.
- 11:35 Incident pages: the detail page with a workflow picture, one timeline of notes and history, and the actions each person is allowed. Filters stay in the address so links can be shared.
- 13:55 Facilities service: buildings, floors, seats and categories, managed by the admin. The report form picks places by name now instead of ids, and warns about possible duplicates.
- 19:16 Dashboards and analytics service. Charts by status, priority and category, response times, workload per engineer, escalated and blocked incidents, and the locations with the most repeat issues. Reporters can rate the work once it's resolved (private from the engineer).
- 20:29 Engineer profiles: the admin can add, edit, deactivate and reactivate engineers. Moved to a bigger generated demo data set (about 300 incidents over 120 days) so the dashboards look real.
- 21:54 Integration tests against a real database for every service, and load tests with Artillery. The cloud held 176 requests a second with no errors. Results are in docs/load-testing.md.

## Friday 20 November

- Bug fixes and tidy-up before code freeze:
  - Reloading any page in the cloud showed an S3 "Access Denied" page. It now loads the app.
  - Only the assigned engineer, the team's manager or the admin can change an incident's status (employees could before).
  - A page that crashes shows a message with a retry button instead of a blank screen.
  - The duplicate warning on the report form used to link to the other incident. Now it only shows the title, category and place, so nobody gets a link to a ticket they're not allowed to see.
  - Removed repeated code across the backend and frontend (shared input checks, lookups, dialogs and data loading), and unit tests now fail if they ever touch a real database.
- Code freeze. CI now only deploys from main, so pushing another branch can't replace the live demo. README has the full project guide: what it does, who can do what, how it's built, how to run and test it, decisions, assumptions and known gaps.
- Last polish before the demo:
  - Employees can now create their own account from the app (Create an account, linked from sign in). It only ever makes employee accounts.
  - Added Playwright end-to-end tests that drive the real app in a browser at desktop, tablet and phone size. They found real layout problems, so I fixed them:
    - on a phone the top bar took three rows, and on a tablet two; the links now sit behind a menu button on smaller screens;
    - on a phone the board cut off its columns and the page was about six screens tall of blank space, because of a long Closed column off to the side; the columns now stack on phones and Closed shows the newest 5;
    - the Facilities tabs and the Delete buttons were cut off on a phone;
    - dates were in three different styles; they're all UK style now (20 Nov 2026, 07:26).
