"""
Incidents routes: method + path -> service function. Paths are relative to /api/incidents.

TODO(auth): every route is public=True until the frontend sends tokens (milestone 2);
then remove public=True and use req.user instead of user_id / actor_id / reporter_id.
"""

import service
from common.http import Route

ROUTES = [
    # Requires the user to be logged in. No role/privilege check: any signed-in user.
    Route("GET", "/", service.list_incidents, public=True),
    # Requires the user to be logged in. No role/privilege check: any signed-in user.
    Route("POST", "/", service.create_incident, status=201, public=True),
    # Requires the user to be logged in. Reporter (while open) or admin. TODO: stub, returns 501.
    Route("PUT", "/{id}", service.update_incident, public=True),
    # Requires the user to be logged in. Admin only. TODO: stub, returns 501.
    Route("DELETE", "/{id}", service.delete_incident, status=204, public=True),
    # Requires the user to be logged in. Assignee / reporter / admin, per service.TRANSITIONS.
    Route("POST", "/{id}/status", service.change_status, public=True),
    # Requires the user to be logged in. Reporter requests; admin clears. TODO: stub, returns 501.
    Route("POST", "/{id}/escalate", service.escalate_incident, public=True),
]
