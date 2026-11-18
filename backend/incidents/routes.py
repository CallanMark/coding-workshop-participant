"""
Incidents routes: method + path -> service function. Paths are relative to /api/incidents.

Every route requires a signed-in user (common.http.handle checks the token). `roles=` limits a
route to some roles (403 otherwise). Which incidents a user may see or change is decided in the
service from req.user: out of scope is 404, visible but not allowed is 403.
"""

import service
from common.http import Route

ROUTES = [
    # Any signed-in user; the list is scoped to the user's role (see service.visible_to). ?mine=true narrows it.
    Route("GET", "/", service.list_incidents),
    # Any signed-in user; the reporter is the signed-in user.
    Route("POST", "/", service.create_incident, status=201),
    # Reporter (while open), team manager or admin. TODO: stub, returns 501.
    Route("PUT", "/{id}", service.update_incident),
    # Admin only. TODO: stub, returns 501.
    Route("DELETE", "/{id}", service.delete_incident, status=204, roles=("admin",)),
    # Assignee / reporter / team manager / admin, per service.TRANSITIONS.
    Route("POST", "/{id}/status", service.change_status),
    # Reporter requests; team manager or admin clears. TODO: stub, returns 501.
    Route("POST", "/{id}/escalate", service.escalate_incident),
]
