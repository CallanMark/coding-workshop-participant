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
    # Any signed-in user: active incidents with the same ?category_id=&building_id=&floor_id= (title and place only).
    Route("GET", "/duplicates", service.find_duplicates),
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
    # Team manager or admin assigns anyone on the team; an engineer can take an unassigned team ticket.
    Route("POST", "/{id}/assign", service.assign_incident, roles=("engineer", "manager", "admin")),
    # Reporter, assignee, team manager or admin escalates; team manager or admin clears.
    Route("POST", "/{id}/escalate", service.escalate_incident),
    # Notes: anyone who can see the incident reads and adds (not once closed); the author edits;
    # the author or an admin deletes.
    Route("GET", "/{id}/notes", service.list_notes),
    Route("POST", "/{id}/notes", service.add_note, status=201),
    Route("PUT", "/{id}/notes/{note_id}", service.edit_note),
    Route("DELETE", "/{id}/notes/{note_id}", service.delete_note, status=204),
    # The audit trail: anyone who can see the incident.
    Route("GET", "/{id}/events", service.list_events),
    # Reporter only, once resolved or closed. Private: never shown to the engineer.
    Route("PUT", "/{id}/feedback", service.save_feedback),
    # Reporter, the engineer's manager or admin (403 for anyone else, including the engineer).
    Route("GET", "/{id}/feedback", service.get_feedback),
    # Manager (own team) or admin: active engineers with availability and workload (the assign dropdown).
    Route("GET", "/engineers", service.list_engineers, roles=("manager", "admin")),
    # The engineer's team manager or admin: all feedback on their work and the average rating.
    Route("GET", "/engineers/{id}/feedback", service.engineer_feedback, roles=("manager", "admin")),
]
