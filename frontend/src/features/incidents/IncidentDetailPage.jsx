import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  addNote, assignIncident, changeIncidentStatus, deleteIncident, deleteNote, editNote, escalateIncident,
  getIncident, listEvents, listNotes, updateIncident,
} from '../../api/incidents';
import { EscalatedChip, PriorityChip, StatusChip } from '../../components/IncidentChips';
import { REASON_REQUIRED, STATUSES } from '../../constants';
import { useAuth } from '../../context/auth';
import { formatDateTime } from './eventText';
import FeedbackCard from './FeedbackCard';
import { allowedActions } from './incidentAccess';
import ConfirmDialog from '../../components/ConfirmDialog';
import Loaded from '../../components/Loaded';
import useApi from '../../hooks/useApi';
import { AssignDialog, EditIncidentDialog } from './IncidentDialogs';
import IncidentTimeline from './IncidentTimeline';
import StatusReasonDialog from './StatusReasonDialog';
import WorkflowStepper from './WorkflowStepper';

/** Button text for moving to a status, from the current one. */
const MOVE_LABELS = {
  'open>in_progress': 'Start work',
  'in_progress>blocked': 'Mark blocked',
  'blocked>in_progress': 'Unblock',
  'in_progress>resolved': 'Resolve',
  'resolved>closed': 'Close',
  'resolved>in_progress': 'Reopen',
  'open>closed': 'Cancel incident',
};

const when = (value) => (value ? formatDateTime(value) : '—');

/** One label/value row in the details card. */
function Fact({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography>{children || '—'}</Typography>
    </Box>
  );
}

Fact.propTypes = {
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};

// The incident with its notes and history, loaded together.
const loadDetail = (id) => Promise.all([getIncident(id), listNotes(id), listEvents(id)])
  .then(([incident, notes, events]) => ({ incident, notes, events }));

/**
 * One incident: workflow, details, the actions the user may take, notes and history in one timeline,
 * and private feedback. Out of scope or missing is "not found" (the server answers 404 for both).
 */
export default function IncidentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const detail = useApi(loadDetail, id);
  const [dialog, setDialog] = useState(null); // { type: 'move' | 'assign' | 'escalate' | 'edit' | 'delete', to? }
  const [dialogError, setDialogError] = useState({});
  const [toast, setToast] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = detail.reload; // after an action: reload quietly, keeping the page on screen

  /**
   * Run one action, then reload. On failure keep the dialog open with field errors when the server named
   * a field, otherwise close it and show the server's message.
   */
  const act = async (request, success, { keepDialogOnFieldError = false } = {}) => {
    setBusy(true);
    try {
      await request();
      setDialog(null);
      setDialogError({});
      setToast({ severity: 'success', message: success });
      refresh();
      return true;
    } catch (error) {
      const fields = error.details || {};
      if (keepDialogOnFieldError && Object.keys(fields).length > 0) {
        setDialogError(fields);
      } else {
        setDialog(null);
        setToast({ severity: 'error', message: Object.values(fields)[0] || error.message });
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (detail.status !== 'ready') {
    return (
      <Loaded
        result={detail}
        label="incident"
        notFound={(
          <Alert severity="info" action={<Button color="inherit" component={RouterLink} to="/incidents">All incidents</Button>}>
            Incident not found. It may have been deleted, or it is not one you can see.
          </Alert>
        )}
      >
        {() => null}
      </Loaded>
    );
  }

  const { incident, notes, events } = detail.data;
  const can = allowedActions(user, incident);
  const place = [incident.building_name, incident.floor_name, incident.seat_code].filter(Boolean).join(' › ');

  const move = (to) => {
    if (REASON_REQUIRED.has(`${incident.status}>${to}`)) setDialog({ type: 'move', to });
    else act(() => changeIncidentStatus(incident.id, { status: to }), `Moved to ${STATUSES[to].label}`);
  };

  const submitNote = async (event) => {
    event.preventDefault();
    const ok = await act(() => addNote(incident.id, noteText.trim()), 'Note added');
    if (ok) setNoteText('');
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">Incident #{incident.id}</Typography>
        <Typography variant="h5" component="h1">{incident.title}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
          <StatusChip status={incident.status} />
          <PriorityChip priority={incident.priority} />
          {incident.is_escalated && <EscalatedChip />}
        </Stack>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <WorkflowStepper status={incident.status} blockedReason={incident.blocked_reason} />
      </Paper>

      <Stack direction="row" spacing={1} role="group" aria-label="Actions" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        {can.moves.map((to) => (
          <Button key={to} variant="contained" disabled={busy} onClick={() => move(to)}>
            {MOVE_LABELS[`${incident.status}>${to}`] || STATUSES[to].label}
          </Button>
        ))}
        {can.take && (
          <Button variant="contained" color="secondary" disabled={busy}
            onClick={() => act(() => assignIncident(incident.id, user.id), 'You are now assigned')}>
            Take it
          </Button>
        )}
        {can.assign && (
          <Button variant="outlined" disabled={busy} onClick={() => setDialog({ type: 'assign' })}>
            {incident.assignee_id ? 'Reassign' : 'Assign'}
          </Button>
        )}
        {can.escalate && (
          <Button variant="outlined" color="warning" disabled={busy} onClick={() => setDialog({ type: 'escalate' })}>
            Escalate
          </Button>
        )}
        {can.clearEscalation && (
          <Button variant="outlined" color="warning" disabled={busy}
            onClick={() => act(() => escalateIncident(incident.id, { escalate: false }), 'Escalation cleared')}>
            Clear escalation
          </Button>
        )}
        {can.edit && <Button disabled={busy} onClick={() => setDialog({ type: 'edit' })}>Edit</Button>}
        {can.remove && (
          <Button color="error" disabled={busy} onClick={() => setDialog({ type: 'delete' })}>Delete</Button>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, alignItems: 'start' }}>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>Description</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }} color={incident.description ? 'text.primary' : 'text.secondary'}>
              {incident.description || 'No description.'}
            </Typography>
            {incident.is_escalated && (
              <Alert severity="warning" sx={{ mt: 2 }}>Escalated: {incident.escalation_reason}</Alert>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Notes and history">
            <Typography variant="h6" component="h2" gutterBottom>Notes and history</Typography>
            <IncidentTimeline
              notes={notes}
              events={events}
              user={user}
              locked={incident.status === 'closed'}
              onEdit={(note, body) => act(() => editNote(incident.id, note.id, body), 'Note updated')}
              onDelete={(note) => act(() => deleteNote(incident.id, note.id), 'Note deleted')}
            />
            {can.note ? (
              <Box component="form" onSubmit={submitNote} sx={{ mt: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="Add a note"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button type="submit" variant="contained" sx={{ mt: 1 }} disabled={busy || !noteText.trim()}>
                  Add note
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                This incident is closed, so no more notes can be added.
              </Typography>
            )}
          </Paper>
        </Stack>

        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Fact label="Category">{`${incident.category_name} · ${incident.team_name}`}</Fact>
              <Fact label="Location">{place}</Fact>
              <Fact label="Reported by">{incident.reporter_name}</Fact>
              <Fact label="Assigned to">{incident.assignee_name || 'Unassigned'}</Fact>
              <Fact label="Reported">{when(incident.created_at)}</Fact>
              <Fact label="Acknowledged">{when(incident.acknowledged_at)}</Fact>
              <Fact label="Resolved">{when(incident.resolved_at)}</Fact>
              {incident.closed_at && <Fact label="Closed">{when(incident.closed_at)}</Fact>}
            </Stack>
          </Paper>
          <FeedbackCard incident={incident} user={user} />
        </Stack>
      </Box>

      {dialog?.type === 'move' && (
        <StatusReasonDialog
          title={`${MOVE_LABELS[`${incident.status}>${dialog.to}`]}: #${incident.id}`}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => act(
            () => changeIncidentStatus(incident.id, { status: dialog.to, reason }),
            `Moved to ${STATUSES[dialog.to].label}`,
          )}
        />
      )}
      {dialog?.type === 'escalate' && (
        <StatusReasonDialog
          title={`Escalate #${incident.id}`}
          confirmLabel="Escalate"
          hint="Why does this need attention now? The team's manager is alerted on their dashboard."
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => act(() => escalateIncident(incident.id, { escalate: true, reason }), 'Escalated')}
        />
      )}
      {dialog?.type === 'assign' && (
        <AssignDialog
          incident={incident}
          error={dialogError.assignee_id}
          onCancel={() => { setDialog(null); setDialogError({}); }}
          onConfirm={(assigneeId) => act(
            () => assignIncident(incident.id, assigneeId),
            assigneeId ? 'Assigned' : 'Unassigned',
            { keepDialogOnFieldError: true },
          )}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditIncidentDialog
          incident={incident}
          errors={dialogError}
          onCancel={() => { setDialog(null); setDialogError({}); }}
          onConfirm={(changes) => act(() => updateIncident(incident.id, changes), 'Saved', { keepDialogOnFieldError: true })}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title={`Delete #${incident.id}?`}
          text="This removes the incident with its notes and history. It cannot be undone."
          confirmLabel="Delete"
          busyLabel="Deleting…"
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            await deleteIncident(incident.id); // a failure shows in the dialog
            navigate('/incidents', { state: { deletedTitle: incident.title } });
          }}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Stack>
  );
}
