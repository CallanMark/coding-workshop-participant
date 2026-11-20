import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AREA_ROLES, hasRole, useAuth } from '../context/auth';
import ErrorBoundary from './ErrorBoundary';

// `to` may depend on the user (e.g. their own dashboard).
const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', roles: AREA_ROLES['/dashboard'], end: true },
  { to: (user) => `/dashboard/engineers/${user.id}`, label: 'My dashboard', roles: ['engineer'] },
  { to: '/incidents/mine', label: 'My incidents' },
  { to: '/incidents', label: 'Incidents', end: true },
  { to: '/admin/engineers', label: 'Engineers', roles: AREA_ROLES['/admin'] },
  { to: '/admin/facilities', label: 'Facilities', roles: AREA_ROLES['/admin'] },
];

/**
 * The signed-in user's name and role, and a sign-out button.
 */
function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login', { replace: true });
    logout();
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ textAlign: 'right', lineHeight: 1.2 }}>
        <Typography variant="body2" component="div">{user.name}</Typography>
        <Typography variant="caption" component="div" sx={{ opacity: 0.8, textTransform: 'capitalize' }}>
          {user.role}
        </Typography>
      </Box>
      <Button color="inherit" variant="outlined" size="small" onClick={handleLogout}>
        Sign out
      </Button>
    </Box>
  );
}

/**
 * App shell: top bar with navigation (links limited by role) and the signed-in user, then the current page.
 */
export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const links = NAV_LINKS
    .filter(({ roles }) => !roles || hasRole(user, ...roles))
    .map((link) => ({ ...link, to: typeof link.to === 'function' ? link.to(user) : link.to }));
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ flexWrap: 'wrap', gap: 1, py: 1 }}>
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            ACME Facilities
          </Typography>
          <nav aria-label="Main" style={{ flexGrow: 1 }}>
            {links.map(({ to, label, end }) => (
              <Button
                key={to}
                color="inherit"
                component={NavLink}
                to={to}
                end={end}
                sx={{ '&.active': { bgcolor: 'rgba(255,255,255,0.16)' } }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <UserMenu />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: 3 }}>
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </Container>
    </>
  );
}
