/**
 * List filters kept in the page URL (?status=open&assignee=me&q=wifi), so a refresh or a shared link
 * keeps them, and their translation into the API's query parameters.
 */

/** URL parameter names the list page understands. */
export const FILTER_NAMES = ['status', 'priority', 'assignee', 'escalated', 'q'];

/**
 * The filter values from the URL, with '' for unset ones.
 * @param {URLSearchParams} searchParams
 * @returns {{status: string, priority: string, assignee: string, escalated: string, q: string}}
 */
export function readFilters(searchParams) {
  return Object.fromEntries(FILTER_NAMES.map((name) => [name, searchParams.get(name) || '']));
}

/**
 * True when any filter is set.
 * @param {object} filters - from readFilters.
 * @returns {boolean}
 */
export function hasFilters(filters) {
  return FILTER_NAMES.some((name) => filters[name]);
}

/**
 * The API query for the filters. "assignee" is "none" (unassigned) or "me" (the signed-in user).
 * @param {object} filters - from readFilters.
 * @param {{id: number}} user
 * @returns {object} parameters for listIncidents.
 */
export function toApiFilters(filters, user) {
  const api = {};
  if (filters.status) api.status = filters.status;
  if (filters.priority) api.priority = filters.priority;
  if (filters.assignee === 'none') api.assignee_id = 'none';
  if (filters.assignee === 'me') api.assignee_id = user.id;
  if (filters.escalated === 'true') api.escalated = 'true';
  if (filters.q.trim()) api.q = filters.q.trim();
  return api;
}
