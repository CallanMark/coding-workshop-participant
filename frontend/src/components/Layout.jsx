import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';

const NAV_LINKS = [
  { to: '/incidents/mine', label: 'My incidents' },
  { to: '/incidents', label: 'All incidents', end: true },
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
 * App shell: top bar with navigation and the signed-in user, then the current page.
 */
export default function Layout() {
  return (
    <>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ flexWrap: 'wrap', gap: 1, py: 1 }}>
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            ACME Facilities
          </Typography>
          <nav aria-label="Main" style={{ flexGrow: 1 }}>
            {NAV_LINKS.map(({ to, label, end }) => (
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
        <Outlet />
      </Container>
    </>
  );
}
