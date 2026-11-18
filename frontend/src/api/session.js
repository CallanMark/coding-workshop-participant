/**
 * The signed-in session (JWT + user) kept in localStorage so it survives reloads.
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded.
 */

const STORAGE_KEY = 'session';

/**
 * Read the stored session.
 * @returns {{token: string, user: object} | null}
 */
export function loadSession() {
  try {
    const session = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return session?.token && session?.user ? session : null;
  } catch {
    return null;
  }
}

/**
 * Remember the session for later visits.
 * @param {{token: string, user: object}} session
 */
export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Not remembered across reloads; still signed in for this page view.
  }
}

/** Forget the session (logout or expired token). */
export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/**
 * The current token, if signed in.
 * @returns {string | null}
 */
export function getToken() {
  return loadSession()?.token ?? null;
}
