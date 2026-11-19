/**
 * The only module that calls fetch. Every API call goes through apiRequest.
 */
import { clearSession, getToken } from './session';

// `npm run dev:cloud` (mode "cloud"): same origin, the dev server proxies /api to CloudFront.
// Otherwise the build-time API URL (CloudFront in AWS), or the LocalStack proxy by default.
const BASE_URL = import.meta.env.MODE === 'cloud'
  ? ''
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

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

let onSessionExpired = null;

/**
 * Register what happens when a signed-in request gets a 401 (AuthProvider signs the user out).
 * @param {function(string): void | null} handler - Receives the server's message.
 */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

/**
 * Send a JSON request to the backend, with the login token when signed in.
 * @param {string} path - Path after /api, e.g. "/incidents".
 * @param {{method?: string, body?: object}} [options]
 * @returns {Promise<any>} Parsed JSON body (null for 204).
 * @throws {ApiError}
 */
export async function apiRequest(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let response;
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  // In AWS, CloudFront answers every 404 (the API's too) with the app's index.html and a 200, so app pages
  // can be opened directly. The API always answers in JSON, so a "success" that isn't JSON was a 404.
  const type = response.headers?.get?.('content-type') ?? 'application/json';
  if (response.ok && response.status !== 204 && !type.includes('json')) {
    throw new ApiError("That couldn't be found. It may have been deleted, or you may not have access to it.", 404);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error;
    const message = error?.message || `Request failed (${response.status})`;
    // A 401 on a request that carried a token means the session is no longer valid.
    // (A 401 without a token is a failed sign-in, which the login form shows itself.)
    if (response.status === 401 && token) {
      clearSession();
      onSessionExpired?.(message);
    }
    throw new ApiError(message, response.status, error?.details || {});
  }
  return data;
}
