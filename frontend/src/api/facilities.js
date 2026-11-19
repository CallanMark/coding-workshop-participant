/**
 * Facilities API calls: buildings, floors, seats, categories and teams.
 * Reading is open to any signed-in user; creating, editing and deleting is admin only.
 */
import { apiRequest } from './client';

/** @returns {Promise<Array<{id: number, name: string, floor_count: number, incident_count: number}>>} */
export function listBuildings() {
  return apiRequest('/facilities/buildings');
}

/**
 * @param {number|string} buildingId
 * @returns {Promise<Array<{id: number, building_id: number, name: string, seat_count: number, incident_count: number}>>}
 */
export function listFloors(buildingId) {
  return apiRequest(`/facilities/buildings/${buildingId}/floors`);
}

/**
 * @param {number|string} floorId
 * @returns {Promise<Array<{id: number, floor_id: number, code: string, incident_count: number}>>}
 */
export function listSeats(floorId) {
  return apiRequest(`/facilities/floors/${floorId}/seats`);
}

/** @returns {Promise<Array<{id: number, name: string, type: string, team_id: number, team_name: string, incident_count: number}>>} */
export function listCategories() {
  return apiRequest('/facilities/categories');
}

/** @returns {Promise<Array<{id: number, name: string}>>} */
export function listTeams() {
  return apiRequest('/facilities/teams');
}

/** Add a building (admin). @param {{name: string}} building */
export function createBuilding(building) {
  return apiRequest('/facilities/buildings', { method: 'POST', body: building });
}

/** Rename a building (admin). */
export function updateBuilding(id, building) {
  return apiRequest(`/facilities/buildings/${id}`, { method: 'PUT', body: building });
}

/** Delete a building with no floors and no incidents (admin). */
export function deleteBuilding(id) {
  return apiRequest(`/facilities/buildings/${id}`, { method: 'DELETE' });
}

/** Add a floor to a building (admin). @param {{name: string}} floor */
export function createFloor(buildingId, floor) {
  return apiRequest(`/facilities/buildings/${buildingId}/floors`, { method: 'POST', body: floor });
}

/** Rename a floor (admin). */
export function updateFloor(id, floor) {
  return apiRequest(`/facilities/floors/${id}`, { method: 'PUT', body: floor });
}

/** Delete a floor with no seats and no incidents (admin). */
export function deleteFloor(id) {
  return apiRequest(`/facilities/floors/${id}`, { method: 'DELETE' });
}

/** Add a seat to a floor (admin). @param {{code: string}} seat */
export function createSeat(floorId, seat) {
  return apiRequest(`/facilities/floors/${floorId}/seats`, { method: 'POST', body: seat });
}

/** Change a seat's code (admin). */
export function updateSeat(id, seat) {
  return apiRequest(`/facilities/seats/${id}`, { method: 'PUT', body: seat });
}

/** Delete a seat no incident mentions (admin). */
export function deleteSeat(id) {
  return apiRequest(`/facilities/seats/${id}`, { method: 'DELETE' });
}

/** Add a category (admin). @param {{name: string, type: string, team_id: number}} category */
export function createCategory(category) {
  return apiRequest('/facilities/categories', { method: 'POST', body: category });
}

/** Change a category (admin); a new team applies to incidents reported from then on. */
export function updateCategory(id, category) {
  return apiRequest(`/facilities/categories/${id}`, { method: 'PUT', body: category });
}

/** Delete a category no incident uses (admin). */
export function deleteCategory(id) {
  return apiRequest(`/facilities/categories/${id}`, { method: 'DELETE' });
}
