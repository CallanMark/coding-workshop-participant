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
    Route("GET", "/", service.list_incidents),  # filters: see service.list_incidents
    # Any signed-in user: active incidents with the same ?category_id=&building_id=&floor_id= (summaries only).
    Route("GET", "/duplicates", service.find_duplicates),
    # Any signed-in user, only for a possible duplicate of that category and place (404 otherwise).
    Route("GET", "/{id}/summary", service.get_duplicate_summary),
    # Anyone who can see the incident (404 otherwise).
    Route("GET", "/{id}", service.get_incident),
    # Any signed-in user; the reporter is the signed-in user.
    Route("POST", "/", service.create_incident, status=201),
    # Reporter (while open), team manager or admin; only the fields sent change.
    Route("PUT", "/{id}", service.update_incident),
    # Admin only; notes and events cascade.
    Route("DELETE", "/{id}", service.delete_incident, status=204, roles=("admin",)),
    # Assignee / reporter / team manager / admin, per service.TRANSITIONS.
    Route("POST", "/{id}/status", service.change_status),
    # Reporter requests; team manager or admin clears. TODO: stub, returns 501.
    Route("POST", "/{id}/escalate", service.escalate_incident),
]
