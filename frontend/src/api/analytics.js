/**
 * Analytics API calls: team and engineer dashboards, and location hotspots.
 * `days` is the window to look back over: 7, 30 or 90. The server decides who may see what.
 */
import { apiRequest } from './client';

/**
 * A team's dashboard: its engineers, its manager or an admin.
 * @param {number|string} teamId
 * @param {number|string} days
 * @returns {Promise<{team: {id: number, name: string}, days: number, open: object, oldest_open: object[],
 *   categories: object[], speed: object}>}
 */
export function getTeamDashboard(teamId, days) {
  return apiRequest(`/analytics/teams/${teamId}?days=${days}`);
}

/**
 * An engineer's dashboard: the engineer, their team's manager or an admin.
 * `feedback` is only included when someone other than the engineer is looking.
 * @param {number|string} engineerId
 * @param {number|string} days
 * @returns {Promise<{engineer: object, days: number, open: object, oldest_open: object[], categories: object[],
 *   speed: object, feedback?: {average: number|null, ratings: number, recent: object[]}}>}
 */
export function getEngineerDashboard(engineerId, days) {
  return apiRequest(`/analytics/engineers/${engineerId}?days=${days}`);
}

/**
 * Admin: buildings, floors and seats with the most recurring issues.
 * @param {number|string} days
 * @returns {Promise<{days: number, buildings: object[], floors: object[], seats: object[]}>}
 */
export function getLocationHotspots(days) {
  return apiRequest(`/analytics/locations?days=${days}`);
}
