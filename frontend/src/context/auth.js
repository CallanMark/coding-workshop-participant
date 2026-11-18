/**
 * The signed-in user, shared across the app. Provided by AuthProvider.
 */
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/**
 * Read the auth state and actions.
 * @returns {{
 *   user: {id: number, name: string, email: string, role: string, team_id: number|null} | null,
 *   notice: string,
 *   login: function(string, string): Promise<object>,
 *   logout: function(string=): void,
 * }}
 */
export function useAuth() {
  return useContext(AuthContext);
}

/**
 * True if the user has one of the roles. For showing or hiding UI only:
 * the backend enforces access on every request.
 * @param {{role: string} | null} user
 * @param {...string} roles - e.g. 'admin', 'manager'.
 * @returns {boolean}
 */
export function hasRole(user, ...roles) {
  return Boolean(user) && roles.includes(user.role);
}
