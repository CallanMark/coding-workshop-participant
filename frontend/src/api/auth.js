/**
 * Auth API calls.
 */
import { apiRequest } from './client';

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 */
export function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password } });
}

/**
 * The signed-in user's current profile (re-read from the database).
 * @returns {Promise<object>}
 */
export function fetchMe() {
  return apiRequest('/auth/me');
}
