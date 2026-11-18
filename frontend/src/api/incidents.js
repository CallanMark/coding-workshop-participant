/**
 * Incidents API calls.
 */
import { apiRequest } from './client';

/**
 * List incidents, newest first.
 * @param {{userId?: number}} [filters] - userId limits to incidents that user reported or is assigned.
 * @returns {Promise<Array<object>>}
 */
export function listIncidents({ userId } = {}) {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  return apiRequest(`/incidents${query}`);
}

/**
 * Create an incident.
 * @param {object} incident - title, building_id, reporter_id and optional fields.
 * @returns {Promise<object>} The created incident.
 */
export function createIncident(incident) {
  return apiRequest('/incidents', { method: 'POST', body: incident });
}

/**
 * Move an incident to a new status.
 * @param {number} id - Incident id.
 * @param {{status: string, reason?: string, actorId: number}} change
 * @returns {Promise<object>} The updated incident.
 */
export function changeIncidentStatus(id, { status, reason, actorId }) {
  return apiRequest(`/incidents/${id}/status`, {
    method: 'POST',
    body: { status, reason, actor_id: actorId },
  });
}
