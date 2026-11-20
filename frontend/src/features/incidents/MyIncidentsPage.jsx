import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { changeIncidentStatus, listIncidents } from '../../api/incidents';
import { NEXT_STATUSES, REASON_REQUIRED, STATUSES } from '../../constants';
import Loaded from '../../components/Loaded';
import { hasRole, useAuth } from '../../context/auth';
import useApi from '../../hooks/useApi';
import BoardCard, { BoardCardContent } from './BoardCard';
import BoardColumn from './BoardColumn';
import StatusReasonDialog from './StatusReasonDialog';

/**
 * Managers and admins run the board for everything they look after: a manager their team's incidents, an
 * admin every incident (the server scopes the list by role). Everyone else sees what they reported or hold.
 */
const leads = (user) => hasRole(user, 'manager', 'admin');
const loadBoard = (lead) => listIncidents(lead ? {} : { mine: true });

/** Closed incidents only pile up, so the column shows the newest few until asked for the rest. */
const CLOSED_SHOWN = 5;

/**
 * Kanban board of the user's incidents; drag a card to another column to change its status.
 * @param {{user: {id: number, name: string}}} props
 */
function IncidentBoard({ user }) {
  const mine = useApi(loadBoard, leads(user));
  const [dragged, setDragged] = useState(null); // incident being dragged
  const [pendingMove, setPendingMove] = useState(null); // { incident, to } waiting for a reason
  const [toast, setToast] = useState(null); // { severity, message }
  const [allClosed, setAllClosed] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const replaceIncident = (incident) => {
    mine.setData((incidents) => incidents.map((i) => (i.id === incident.id ? incident : i)));
  };

  // Move the card straight away, then confirm with the server (or put it back on error).
  const moveIncident = async (incident, to, reason) => {
    replaceIncident({ ...incident, status: to });
    try {
      const updated = await changeIncidentStatus(incident.id, { status: to, reason });
      replaceIncident(updated);
      setToast({ severity: 'success', message: `#${incident.id} moved to ${STATUSES[to].label}` });
    } catch (error) {
      replaceIncident(incident);
      setToast({ severity: 'error', message: error.message });
    }
  };

  const handleDragStart = ({ active }) => {
    setDragged(mine.data.find((i) => i.id === active.id) || null);
  };

  const handleDragEnd = ({ over }) => {
    const incident = dragged;
    setDragged(null);
    if (!incident || !over || over.id === incident.status) return;

    const to = over.id;
    if (!NEXT_STATUSES[incident.status].includes(to)) {
      setToast({
        severity: 'warning',
        message: `Can't move from ${STATUSES[incident.status].label} to ${STATUSES[to].label}`,
      });
    } else if (REASON_REQUIRED.has(`${incident.status}>${to}`)) {
      setPendingMove({ incident, to });
    } else {
      moveIncident(incident, to);
    }
  };

  // Loading or error: Loaded shows the spinner or the error with Retry.
  if (mine.status !== 'ready') return <Loaded result={mine} label="incidents">{() => null}</Loaded>;
  if (mine.data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography gutterBottom>
          {leads(user)
            ? 'There are no incidents to manage yet.'
            : `${user.name} hasn't reported and isn't assigned to any incidents.`}
        </Typography>
        <Button variant="contained" component={RouterLink} to="/incidents/new">Report an incident</Button>
      </Paper>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'flex-start' },
            gap: 1.5,
            overflowX: 'auto',
            pb: 1,
          }}
        >
          {Object.keys(STATUSES).map((status) => {
            const incidents = mine.data.filter((i) => i.status === status);
            const hidden = status === 'closed' && !allClosed ? Math.max(incidents.length - CLOSED_SHOWN, 0) : 0;
            return (
              <BoardColumn
                key={status}
                status={status}
                count={incidents.length}
                draggingFrom={dragged ? dragged.status : null}
              >
                {incidents.slice(0, incidents.length - hidden).map((incident) => (
                  <BoardCard key={incident.id} incident={incident} userId={user.id} />
                ))}
                {hidden > 0 && (
                  <Button size="small" onClick={() => setAllClosed(true)}>Show all {incidents.length} closed</Button>
                )}
              </BoardColumn>
            );
          })}
        </Box>
        <DragOverlay>
          {dragged && (
            <Card variant="outlined" sx={{ cursor: 'grabbing', boxShadow: 6 }}>
              <BoardCardContent incident={dragged} userId={user.id} />
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {pendingMove && (
        <StatusReasonDialog
          title={`Move #${pendingMove.incident.id} to ${STATUSES[pendingMove.to].label}`}
          onCancel={() => setPendingMove(null)}
          onConfirm={(reason) => {
            moveIncident(pendingMove.incident, pendingMove.to, reason);
            setPendingMove(null);
          }}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

IncidentBoard.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
};

/**
 * "My incidents" page as a board: for managers their team's incidents, for admins every incident, for
 * everyone else the ones they reported or are assigned to.
 */
export default function MyIncidentsPage() {
  const { user } = useAuth();
  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}
      >
        <Box>
          <Typography variant="h5" component="h1">My incidents</Typography>
          <Typography variant="body2" color="text.secondary">
            {{
              manager: 'Every incident on your team.',
              admin: 'Every incident, across all teams.',
            }[user.role] || `Reported by or assigned to ${user.name}.`}
            {' '}Drag a card to change its status.
          </Typography>
        </Box>
        <Button variant="contained" component={RouterLink} to="/incidents/new">Report incident</Button>
      </Stack>
      {/* key: switching user remounts the board so it starts in a clean loading state */}
      <IncidentBoard key={user.id} user={user} />
    </>
  );
}
