/**
 * Engineer profile API calls (facility admin only): list, create, change, deactivate and reactivate.
 */
import { apiRequest } from './client';

/**
 * Every engineer, deactivated ones too, with team, availability and open workload.
 * @param {number|string} [teamId] - only this team's engineers.
 * @returns {Promise<Array<{id: number, name: string, email: string, team_id: number, team_name: string,
 *   is_available: boolean, is_active: boolean, open_incidents: number}>>}
 */
export function listEngineerProfiles(teamId) {
  return apiRequest(teamId ? `/auth/engineers?team_id=${encodeURIComponent(teamId)}` : '/auth/engineers');
}

/**
 * Create an engineer with a temporary password to give them.
 * @param {{name: string, email: string, password: string, team_id: number}} engineer
 */
export function createEngineer(engineer) {
  return apiRequest('/auth/engineers', { method: 'POST', body: engineer });
}

/**
 * Change an engineer. Only the fields sent change: name, team_id, is_available, is_active.
 * @param {number} id
 * @param {object} changes
 */
export function updateEngineer(id, changes) {
  return apiRequest(`/auth/engineers/${id}`, { method: 'PATCH', body: changes });
}
