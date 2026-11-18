import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router-dom';
import { DEV_USERS, useCurrentUser } from '../context/currentUser';

const NAV_LINKS = [
  { to: '/incidents/mine', label: 'My incidents' },
  { to: '/incidents', label: 'All incidents', end: true },
];

/**
 * Temporary "acting as" dropdown so each persona can be tried before login exists.
 * TODO(auth): replace with the signed-in user's name and a logout button.
 */
function UserPicker() {
  const { user, setUserId } = useCurrentUser();
  return (
    <TextField
      select
      size="small"
      label="Acting as"
      value={user.id}
      onChange={(event) => setUserId(Number(event.target.value))}
      sx={{
        minWidth: 200,
        '& .MuiInputBase-root': { color: 'inherit', bgcolor: 'rgba(255,255,255,0.12)' },
        '& .MuiInputLabel-root, & .MuiSvgIcon-root': { color: 'inherit' },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.5)' },
      }}
    >
      {DEV_USERS.map((u) => (
        <MenuItem key={u.id} value={u.id}>{u.name} ({u.role})</MenuItem>
      ))}
    </TextField>
  );
}

/**
 * App shell: top bar with navigation and user picker, then the current page.
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
          <UserPicker />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}
