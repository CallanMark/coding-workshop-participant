/**
 * Incidents API calls.
 */
import { apiRequest } from './client';

/**
 * List the incidents the signed-in user may see (scoped by role on the server), newest first.
 * @param {{mine?: boolean}} [filters] - mine: only incidents the user reported or is assigned to.
 * @returns {Promise<Array<object>>}
 */
export function listIncidents({ mine = false } = {}) {
  return apiRequest(`/incidents${mine ? '?mine=true' : ''}`);
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
