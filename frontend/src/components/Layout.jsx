import { useState } from 'react';
import PropTypes from 'prop-types';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import SvgIcon from '@mui/material/SvgIcon';
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

// Phones and tablets get a menu button; on wider screens the links sit in the bar.
// (Below 900px an admin's five links and their name don't fit on one row.)
const SMALL_ONLY = { xs: 'inline-flex', md: 'none' };
const WIDE_ONLY = { xs: 'none', md: 'flex' };

/** The three-line "menu" icon (inline, so no icon package is needed). */
function MenuIcon() {
  return (
    <SvgIcon>
      <path d="M3 18h18v-2H3zm0-5h18v-2H3zm0-7v2h18V6z" />
    </SvgIcon>
  );
}

/** The signed-in user's name and role. */
function WhoAmI({ align = 'right' }) {
  const { user } = useAuth();
  return (
    <Box sx={{ textAlign: align, lineHeight: 1.2 }}>
      <Typography variant="body2" component="div">{user.name}</Typography>
      <Typography variant="caption" component="div" sx={{ opacity: 0.8, textTransform: 'capitalize' }}>
        {user.role}
      </Typography>
    </Box>
  );
}

WhoAmI.propTypes = {
  align: PropTypes.oneOf(['left', 'right']),
};

/** Sign out and go to the sign-in page. */
function useSignOut() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return () => {
    navigate('/login', { replace: true });
    logout();
  };
}

/**
 * App shell: top bar with navigation (links limited by role) and the signed-in user, then the current page.
 * On phones and tablets the links, the user and sign-out move into a side menu.
 */
export default function Layout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = NAV_LINKS
    .filter(({ roles }) => !roles || hasRole(user, ...roles))
    .map((link) => ({ ...link, to: typeof link.to === 'function' ? link.to(user) : link.to }));

  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ flexWrap: 'wrap', gap: 1, py: 1 }}>
          <Typography variant="h6" component="div" sx={{ mr: 2, flexGrow: { xs: 1, md: 0 } }}>
            ACME Facilities
          </Typography>
          <Box component="nav" aria-label="Main" sx={{ flexGrow: 1, display: WIDE_ONLY, flexWrap: 'wrap' }}>
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
          </Box>
          <Box sx={{ display: WIDE_ONLY, alignItems: 'center', gap: 1.5 }}>
            <WhoAmI />
            <Button color="inherit" variant="outlined" size="small" onClick={signOut}>Sign out</Button>
          </Box>
          <IconButton
            color="inherit"
            edge="end"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            sx={{ display: SMALL_ONLY }}
          >
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer anchor="right" open={menuOpen} onClose={() => setMenuOpen(false)}>
        <Box sx={{ width: 260 }} role="region" aria-label="Menu">
          <Box sx={{ p: 2 }}><WhoAmI align="left" /></Box>
          <Divider />
          <List component="nav" aria-label="Menu links">
            {links.map(({ to, label, end }) => (
              <ListItemButton
                key={to}
                component={NavLink}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                sx={{ '&.active': { bgcolor: 'action.selected' } }}
              >
                <ListItemText primary={label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Button fullWidth variant="outlined" onClick={() => { setMenuOpen(false); signOut(); }}>Sign out</Button>
          </Box>
        </Box>
      </Drawer>

      <Container component="main" maxWidth="xl" sx={{ py: 3 }}>
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </Container>
    </>
  );
}
