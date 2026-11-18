import PropTypes from 'prop-types';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { hasRole, useAuth } from '../context/auth';

/**
 * Route guard. Signed out: sends the user to /login and remembers where they were going.
 * With `roles`: signed-in users without one of those roles see a "no access" message.
 * (UI only; the backend enforces the same rules on every request.)
 * @param {{roles?: string[]}} props
 */
export default function RequireAuth({ roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !hasRole(user, ...roles)) {
    return <Alert severity="warning">You don&apos;t have access to this page.</Alert>;
  }
  return <Outlet />;
}

RequireAuth.propTypes = {
  roles: PropTypes.arrayOf(PropTypes.string),
};
