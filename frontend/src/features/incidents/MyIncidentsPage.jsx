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
import { useAuth } from '../../context/auth';
import useApi from '../../hooks/useApi';
import BoardCard, { BoardCardContent } from './BoardCard';
import BoardColumn from './BoardColumn';
import StatusReasonDialog from './StatusReasonDialog';

const loadMine = () => listIncidents({ mine: true });

/**
 * Kanban board of the user's incidents; drag a card to another column to change its status.
 * @param {{user: {id: number, name: string}}} props
 */
function IncidentBoard({ user }) {
  const mine = useApi(loadMine, user.id);
  const [dragged, setDragged] = useState(null); // incident being dragged
  const [pendingMove, setPendingMove] = useState(null); // { incident, to } waiting for a reason
  const [toast, setToast] = useState(null); // { severity, message }

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
          {user.name} hasn&apos;t reported and isn&apos;t assigned to any incidents.
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
        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
          {Object.keys(STATUSES).map((status) => {
            const incidents = mine.data.filter((i) => i.status === status);
            return (
              <BoardColumn
                key={status}
                status={status}
                count={incidents.length}
                draggingFrom={dragged ? dragged.status : null}
              >
                {incidents.map((incident) => (
                  <BoardCard key={incident.id} incident={incident} userId={user.id} />
                ))}
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
 * "My incidents" page: incidents the current user reported or is assigned to, as a board.
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
            Reported by or assigned to {user.name}. Drag a card to change its status.
          </Typography>
        </Box>
        <Button variant="contained" component={RouterLink} to="/incidents/new">Report incident</Button>
      </Stack>
      {/* key: switching user remounts the board so it starts in a clean loading state */}
      <IncidentBoard key={user.id} user={user} />
    </>
  );
}
