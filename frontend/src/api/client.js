/**
 * The only module that calls fetch. Every API call goes through apiRequest.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/** Error thrown for any failed API call (HTTP error or network failure). */
export class ApiError extends Error {
  /**
   * @param {string} message - Human-readable message, safe to show to users.
   * @param {number} status - HTTP status code, or 0 for network errors.
   * @param {Object<string, string>} details - Field-level validation messages.
   */
  constructor(message, status, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Send a JSON request to the backend.
 * @param {string} path - Path after /api, e.g. "/incidents".
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<any>} Parsed JSON body (null for 204).
 * @throws {ApiError}
 */
export async function apiRequest(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    throw new ApiError(
      error?.message || `Request failed (${response.status})`,
      response.status,
      error?.details || {},
    );
  }
  return data;
}
