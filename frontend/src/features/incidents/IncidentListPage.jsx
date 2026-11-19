import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useMediaQuery } from 'react-responsive';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { listIncidents } from '../../api/incidents';
import { useAuth } from '../../context/auth';
import { PriorityChip, StatusChip } from '../../components/IncidentChips';

/**
 * Join building / floor / seat into one readable location string.
 * @param {object} incident
 * @returns {string}
 */
function formatLocation(incident) {
  return [incident.building_name, incident.floor_name, incident.seat_code]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Format an ISO timestamp for display in the user's locale.
 * @param {string} value
 * @returns {string}
 */
function formatDate(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const incidentShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  title: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  priority: PropTypes.string.isRequired,
  category_name: PropTypes.string,
  team_name: PropTypes.string,
  reporter_name: PropTypes.string,
  assignee_name: PropTypes.string,
  created_at: PropTypes.string.isRequired,
});

/**
 * Desktop view: one table row per incident.
 * @param {{incidents: Array<object>}} props
 */
function IncidentTable({ incidents }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Incidents">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Priority</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Team</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Reporter</TableCell>
            <TableCell>Assignee</TableCell>
            <TableCell>Created</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {incidents.map((incident) => (
            <TableRow key={incident.id} hover>
              <TableCell>{incident.id}</TableCell>
              <TableCell>
                <Link component={RouterLink} to={`/incidents/${incident.id}`}>{incident.title}</Link>
              </TableCell>
              <TableCell><StatusChip status={incident.status} /></TableCell>
              <TableCell><PriorityChip priority={incident.priority} /></TableCell>
              <TableCell>{incident.category_name}</TableCell>
              <TableCell>{incident.team_name}</TableCell>
              <TableCell>{formatLocation(incident)}</TableCell>
              <TableCell>{incident.reporter_name}</TableCell>
              <TableCell>{incident.assignee_name || 'Unassigned'}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(incident.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

IncidentTable.propTypes = {
  incidents: PropTypes.arrayOf(incidentShape).isRequired,
};

/**
 * Phone view: one card per incident.
 * @param {{incidents: Array<object>}} props
 */
function IncidentCards({ incidents }) {
  return (
    <Stack spacing={1.5}>
      {incidents.map((incident) => (
        <Card key={incident.id} variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" component="h2" gutterBottom>
              <Link component={RouterLink} to={`/incidents/${incident.id}`}>#{incident.id} {incident.title}</Link>
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <StatusChip status={incident.status} />
              <PriorityChip priority={incident.priority} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {formatLocation(incident)}
              {` — ${incident.category_name} (${incident.team_name})`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {incident.assignee_name || 'Unassigned'} · {formatDate(incident.created_at)}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

IncidentCards.propTypes = {
  incidents: PropTypes.arrayOf(incidentShape).isRequired,
};

// What the server-scoped list contains for each role (see backend incidents service.visible_to).
const LIST_TITLES = {
  admin: 'All incidents',
  manager: 'Team incidents',
  engineer: 'Team incidents',
  employee: 'My reported incidents',
};

/**
 * Incidents list page: handles loading, error (with retry), empty and data states.
 * The server decides which incidents the signed-in user may see; the title says which.
 */
export default function IncidentListPage() {
  const { user } = useAuth();
  const isPhone = useMediaQuery({ maxWidth: 899 });
  const location = useLocation();
  const createdTitle = location.state?.createdTitle;
  const deletedTitle = location.state?.deletedTitle;
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ status: 'loading', incidents: [], error: null });

  useEffect(() => {
    let ignore = false;
    listIncidents()
      .then((incidents) => {
        if (!ignore) setState({ status: 'success', incidents, error: null });
      })
      .catch((error) => {
        if (!ignore) setState({ status: 'error', incidents: [], error: error.message });
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    setReloadKey((key) => key + 1);
  };

  let content;
  if (state.status === 'loading') {
    content = (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading incidents" />
      </Box>
    );
  } else if (state.status === 'error') {
    content = (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={retry}>Retry</Button>}>
        {state.error}
      </Alert>
    );
  } else if (state.incidents.length === 0) {
    content = (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography gutterBottom>No incidents yet.</Typography>
        <Button variant="contained" component={RouterLink} to="/incidents/new">
          Report the first one
        </Button>
      </Paper>
    );
  } else if (isPhone) {
    content = <IncidentCards incidents={state.incidents} />;
  } else {
    content = <IncidentTable incidents={state.incidents} />;
  }

  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" component="h1">{LIST_TITLES[user.role] || 'Incidents'}</Typography>
        <Button variant="contained" component={RouterLink} to="/incidents/new">
          Report incident
        </Button>
      </Stack>
      {createdTitle && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Incident &quot;{createdTitle}&quot; was reported.
        </Alert>
      )}
      {deletedTitle && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Incident &quot;{deletedTitle}&quot; was deleted.
        </Alert>
      )}
      {content}
    </>
  );
}
