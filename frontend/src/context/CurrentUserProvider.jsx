import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { CurrentUserContext, DEV_USERS } from './currentUser';

const STORAGE_KEY = 'actingAsUserId';

/**
 * Read the remembered user id; storage can be unavailable, so fall back quietly.
 * @returns {number}
 */
function loadUserId() {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return DEV_USERS.some((u) => u.id === stored) ? stored : DEV_USERS[0].id;
  } catch {
    return DEV_USERS[0].id;
  }
}

/**
 * Provides the temporary "acting as" user to the app and remembers the choice.
 * @param {{children: React.ReactNode}} props
 */
export default function CurrentUserProvider({ children }) {
  const [userId, setUserIdState] = useState(loadUserId);

  const value = useMemo(() => ({
    user: DEV_USERS.find((u) => u.id === userId),
    setUserId: (id) => {
      setUserIdState(id);
      try {
        localStorage.setItem(STORAGE_KEY, String(id));
      } catch {
        // Not remembered across reloads; still works for this session.
      }
    },
  }), [userId]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

CurrentUserProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
