"""
Analytics routes: method + path -> service function. Paths are relative to /api/analytics.

Read-only dashboards. Which team or engineer a user may look at is decided in the service:
your own team, yourself, the engineers you manage, or anything for an admin.
Every route takes ?days=7|30|90 (default 30) for the time window.
"""

import service
from common.http import Route

STAFF = ("engineer", "manager", "admin")

ROUTES = [
    # Engineers and the manager of that team, or admin: open work, top categories and how fast it's handled.
    Route("GET", "/teams/{id}", service.team_dashboard, roles=STAFF),
    # The engineer, their team's manager, or admin. Feedback is only included for the manager or admin.
    Route("GET", "/engineers/{id}", service.engineer_dashboard, roles=STAFF),
    # Admin: the buildings, floors and seats with the most recurring issues.
    Route("GET", "/locations", service.location_hotspots, roles=("admin",)),
]
