/**
 * Incidents API calls.
 */
import { apiRequest } from './client';

/**
 * List the incidents the signed-in user may see (scoped by role on the server), newest first.
 * @param {{mine?: boolean, status?: string, priority?: string, assignee_id?: number|string,
 *   escalated?: boolean|string, category_id?: number|string, building_id?: number|string, q?: string}} [filters]
 *   mine: only incidents the user reported or is assigned to; assignee_id "none" = unassigned;
 *   q: text search on title and description. Empty values are left out.
 * @returns {Promise<Array<object>>}
 */
export function listIncidents({ mine = false, ...filters } = {}) {
  const params = new URLSearchParams();
  if (mine) params.set('mine', 'true');
  Object.entries(filters).forEach(([name, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(name, String(value).trim());
  });
  const query = params.toString();
  return apiRequest(`/incidents${query ? `?${query}` : ''}`);
}

/**
 * Create an incident; the reporter is the signed-in user.
 * @param {object} incident - title, category_id, building_id and optional fields.
 * @returns {Promise<object>} The created incident.
 */
export function createIncident(incident) {
  return apiRequest('/incidents', { method: 'POST', body: incident });
}

/**
 * Move an incident to a new status, as the signed-in user.
 * @param {number} id - Incident id.
 * @param {{status: string, reason?: string}} change
 * @returns {Promise<object>} The updated incident.
 */
export function changeIncidentStatus(id, { status, reason }) {
  return apiRequest(`/incidents/${id}/status`, { method: 'POST', body: { status, reason } });
}

/**
 * One incident with full detail; fails with 404 unless the signed-in user may see it.
 * @param {number|string} id - Incident id.
 * @returns {Promise<object>}
 */
export function getIncident(id) {
  return apiRequest(`/incidents/${id}`);
}

/**
 * The query string for a duplicate check: category and building, plus floor when chosen.
 * @param {{category_id: number|string, building_id: number|string, floor_id?: number|string}} location
 * @returns {string} e.g. "category_id=1&building_id=1&floor_id=2"
 */
export function locationQuery({ category_id, building_id, floor_id }) {
  const params = new URLSearchParams({ category_id: String(category_id), building_id: String(building_id) });
  if (floor_id) params.set('floor_id', String(floor_id));
  return params.toString();
}

/**
 * Active incidents with the same category, building and floor as one being reported: title and place only.
 * @param {{category_id: number|string, building_id: number|string, floor_id?: number|string}} location
 * @returns {Promise<Array<object>>}
 */
export function findDuplicates(location) {
  return apiRequest(`/incidents/duplicates?${locationQuery(location)}`);
}

/**
 * Edit an incident's details; only the fields sent change (reporter while open, team manager or admin).
 * @param {number|string} id
 * @param {object} changes - any of title, description, priority, category_id, building_id, floor_id, seat_id.
 * @returns {Promise<object>} The updated incident.
 */
export function updateIncident(id, changes) {
  return apiRequest(`/incidents/${id}`, { method: 'PUT', body: changes });
}

/**
 * Delete an incident and its notes and history (admin only).
 * @param {number|string} id
 * @returns {Promise<null>}
 */
export function deleteIncident(id) {
  return apiRequest(`/incidents/${id}`, { method: 'DELETE' });
}

/**
 * Assign an engineer (team manager or admin), take the incident yourself (engineer), or unassign with null.
 * @param {number|string} id
 * @param {number|null} assigneeId
 * @returns {Promise<object>} The updated incident.
 */
export function assignIncident(id, assigneeId) {
  return apiRequest(`/incidents/${id}/assign`, { method: 'POST', body: { assignee_id: assigneeId } });
}

/**
 * Escalate an incident with a reason, or clear the escalation (team manager or admin).
 * @param {number|string} id
 * @param {{escalate: boolean, reason?: string}} change
 * @returns {Promise<object>} The updated incident.
 */
export function escalateIncident(id, { escalate, reason }) {
  return apiRequest(`/incidents/${id}/escalate`, { method: 'POST', body: { escalate, reason } });
}

/**
 * An incident's notes, oldest first.
 * @param {number|string} id
 * @returns {Promise<Array<object>>}
 */
export function listNotes(id) {
  return apiRequest(`/incidents/${id}/notes`);
}

/**
 * Add a note as the signed-in user.
 * @param {number|string} id
 * @param {string} body
 * @returns {Promise<object>} The new note.
 */
export function addNote(id, body) {
  return apiRequest(`/incidents/${id}/notes`, { method: 'POST', body: { body } });
}

/**
 * Change the text of your own note.
 * @param {number|string} id - Incident id.
 * @param {number} noteId
 * @param {string} body
 * @returns {Promise<object>} The updated note.
 */
export function editNote(id, noteId, body) {
  return apiRequest(`/incidents/${id}/notes/${noteId}`, { method: 'PUT', body: { body } });
}

/**
 * Delete a note (its author, or an admin).
 * @param {number|string} id - Incident id.
 * @param {number} noteId
 * @returns {Promise<null>}
 */
export function deleteNote(id, noteId) {
  return apiRequest(`/incidents/${id}/notes/${noteId}`, { method: 'DELETE' });
}

/**
 * An incident's history (status changes, assignments, escalations...), oldest first, with names.
 * @param {number|string} id
 * @returns {Promise<Array<object>>}
 */
export function listEvents(id) {
  return apiRequest(`/incidents/${id}/events`);
}

/**
 * The reporter's private feedback on the incident, or null if none yet.
 * Fails with 403 for anyone but the reporter, the engineer's manager and admins.
 * @param {number|string} id
 * @returns {Promise<object|null>}
 */
export function getFeedback(id) {
  return apiRequest(`/incidents/${id}/feedback`);
}

/**
 * Give or change feedback on the completed work (the reporter, once resolved; locked once closed).
 * @param {number|string} id
 * @param {{rating: number, comment?: string}} feedback
 * @returns {Promise<object>} The saved feedback.
 */
export function saveFeedback(id, { rating, comment }) {
  return apiRequest(`/incidents/${id}/feedback`, { method: 'PUT', body: { rating, comment } });
}

/**
 * Active engineers with availability and workload, for the assign dropdown (team manager or admin).
 * @param {number} teamId - Managers can only ask for their own team.
 * @returns {Promise<Array<{id: number, name: string, is_available: boolean, open_incidents: number}>>}
 */
export function listEngineers(teamId) {
  return apiRequest(`/incidents/engineers?team_id=${encodeURIComponent(teamId)}`);
}
