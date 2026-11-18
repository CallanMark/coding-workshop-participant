/**
 * Temporary "acting as" user, until real login exists.
 * TODO(auth): replace with AuthContext and the logged-in user; delete DEV_USERS.
 */
import { createContext, useContext } from 'react';

/** Mirrors the users in backend/_common/seed.sql. */
export const DEV_USERS = [
  { id: 1, name: 'Alex Admin', role: 'admin' },
  { id: 2, name: 'Eve Employee', role: 'employee' },
  { id: 3, name: 'Sam Employee', role: 'employee' },
  { id: 4, name: 'Fred Facilities', role: 'engineer' },
  { id: 5, name: 'Tina Tech', role: 'engineer' },
  { id: 6, name: 'Omar Offline', role: 'engineer' },
  { id: 7, name: 'Morgan Manager', role: 'manager' },
];

export const CurrentUserContext = createContext(null);

/**
 * Read the current user and its setter.
 * @returns {{user: {id: number, name: string, role: string}, setUserId: function(number): void}}
 */
export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
