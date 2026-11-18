import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth';

/**
 * Route guard: renders the child routes when signed in, otherwise sends the user to /login
 * and remembers where they were going so they return there after signing in.
 */
export default function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
