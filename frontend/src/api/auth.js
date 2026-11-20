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
 * Create an employee account (the server only ever makes employees here) and sign in.
 * @param {{name: string, email: string, password: string}} account - email must be @acme.inc.
 * @returns {Promise<{token: string, user: object}>}
 */
export function register(account) {
  return apiRequest('/auth/register', { method: 'POST', body: account });
}

/**
 * The signed-in user's current profile (re-read from the database).
 * @returns {Promise<object>}
 */
export function fetchMe() {
  return apiRequest('/auth/me');
}
