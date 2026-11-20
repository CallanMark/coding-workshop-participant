import {
  useCallback, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';
import { fetchMe, login as apiLogin, register as apiRegister } from '../api/auth';
import { setSessionExpiredHandler } from '../api/client';
import {
  clearSession, getToken, loadSession, saveSession,
} from '../api/session';
import { AuthContext } from './auth';

/**
 * Holds the signed-in session for the app.
 * Starts from the stored session so a reload stays signed in, then re-checks it with /auth/me
 * (a deactivated account or expired token signs the user out).
 * @param {{children: React.ReactNode}} props
 */
export default function AuthProvider({ children }) {
  const [stored] = useState(loadSession);
  const [session, setSession] = useState(stored);
  const [notice, setNotice] = useState('');

  const logout = useCallback((message = '') => {
    clearSession();
    setSession(null);
    setNotice(message);
  }, []);

  // Keep a session the server just issued (sign-in or registration) and return its user.
  const start = useCallback((next) => {
    saveSession(next);
    setSession(next);
    setNotice('');
    return next.user;
  }, []);

  const login = useCallback(
    async (email, password) => start(await apiLogin(email, password)),
    [start],
  );

  const register = useCallback(async (account) => start(await apiRegister(account)), [start]);

  // Any signed-in request that gets a 401 ends the session.
  useEffect(() => {
    setSessionExpiredHandler(logout);
    return () => setSessionExpiredHandler(null);
  }, [logout]);

  // Refresh the stored user once on load. A 401 is handled by the client (signs out);
  // a network error keeps the stored user so a flaky connection does not sign anyone out.
  useEffect(() => {
    if (!stored) return undefined;
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (cancelled || getToken() !== stored.token) return;
        const next = { token: stored.token, user };
        saveSession(next);
        setSession(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stored]);

  const value = useMemo(() => ({
    user: session?.user ?? null,
    notice,
    login,
    register,
    logout,
  }), [session, notice, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
