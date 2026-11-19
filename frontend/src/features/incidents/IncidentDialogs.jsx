import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { listEngineers } from '../../api/incidents';
import { PRIORITIES } from '../../constants';
import { CategorySelect, LocationFields } from '../facilities/FacilityFields';

/**
 * Assign an engineer from the incident's team (team manager or admin). Unavailable engineers are listed
 * but can't be picked; each shows how many active incidents they already hold. The server re-checks.
 * Mount only while open so the choice starts fresh.
 * @param {{incident: object, error?: string, onCancel: function(): void, onConfirm: function(number|null): void}} props
 */
export function AssignDialog({ incident, error = '', onCancel, onConfirm }) {
  const [engineers, setEngineers] = useState({ status: 'loading', list: [], error: '' });
  const [choice, setChoice] = useState(incident.assignee_id ? String(incident.assignee_id) : '');

  useEffect(() => {
    let ignore = false;
    listEngineers(incident.team_id)
      .then((list) => { if (!ignore) setEngineers({ status: 'ready', list, error: '' }); })
      .catch((err) => { if (!ignore) setEngineers({ status: 'error', list: [], error: err.message }); });
    return () => {
      ignore = true;
    };
  }, [incident.team_id]);

  const submit = (event) => {
    event.preventDefault();
    if (choice) onConfirm(Number(choice));
  };

  let helper = error || `Engineers on ${incident.team_name}.`;
  if (engineers.status === 'error') helper = engineers.error;
  if (engineers.status === 'ready' && engineers.list.length === 0) helper = `${incident.team_name} has no active engineers.`;

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Assign #{incident.id}</DialogTitle>
        <DialogContent>
          <TextField
            select
            autoFocus
            fullWidth
            margin="dense"
            label="Engineer"
            value={engineers.status === 'ready' ? choice : ''}
            onChange={(e) => setChoice(e.target.value)}
            disabled={engineers.status !== 'ready' || engineers.list.length === 0}
            error={Boolean(error) || engineers.status === 'error'}
            helperText={engineers.status === 'loading' ? 'Loading engineers…' : helper}
          >
            {engineers.list.map((engineer) => (
              <MenuItem key={engineer.id} value={String(engineer.id)} disabled={!engineer.is_available}>
                <ListItemText
                  primary={engineer.name}
                  secondary={`${engineer.is_available ? 'Available' : 'Unavailable'} · ${engineer.open_incidents} open`}
                />
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          {incident.assignee_id && incident.status === 'open' && (
            <Button color="warning" onClick={() => onConfirm(null)} sx={{ mr: 'auto' }}>Unassign</Button>
          )}
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!choice || choice === String(incident.assignee_id ?? '')}
          >
            Assign
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

AssignDialog.propTypes = {
  incident: PropTypes.object.isRequired,
  error: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

const idText = (value) => (value == null ? '' : String(value));

/**
 * Edit title, description, priority, category and location; only changed fields are sent.
 * Warns when the new category belongs to another team (the incident moves there and is unassigned).
 * @param {{incident: object, errors?: object, onCancel: function(): void, onConfirm: function(object): void}} props
 */
export function EditIncidentDialog({ incident, errors = {}, onCancel, onConfirm }) {
  const [form, setForm] = useState({
    title: incident.title,
    description: incident.description || '',
    priority: incident.priority,
    category_id: idText(incident.category_id),
    building_id: idText(incident.building_id),
    floor_id: idText(incident.floor_id),
    seat_id: idText(incident.seat_id),
  });
  const [newTeam, setNewTeam] = useState(null); // the chosen category's team, when it differs
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const submit = (event) => {
    event.preventDefault();
    const changes = {};
    if (form.title.trim() !== incident.title) changes.title = form.title.trim();
    if (form.description.trim() !== (incident.description || '')) changes.description = form.description.trim();
    if (form.priority !== incident.priority) changes.priority = form.priority;
    ['category_id', 'building_id', 'floor_id', 'seat_id'].forEach((name) => {
      if (form[name] !== idText(incident[name])) changes[name] = form[name] === '' ? null : Number(form[name]);
    });
    if (Object.keys(changes).length === 0) onCancel();
    else onConfirm(changes);
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="md">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Edit #{incident.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              name="title"
              label="Title"
              required
              value={form.title}
              onChange={change}
              error={Boolean(errors.title) || !form.title.trim()}
              helperText={errors.title || (!form.title.trim() ? 'Title is required' : '')}
            />
            <TextField name="description" label="Description" multiline minRows={3} value={form.description} onChange={change} />
            <TextField name="priority" label="Priority" select value={form.priority} onChange={change}>
              {Object.entries(PRIORITIES).map(([value, { label }]) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </TextField>
            <CategorySelect
              value={form.category_id}
              onChange={(id, category) => {
                setForm({ ...form, category_id: id });
                setNewTeam(category && category.team_id !== incident.team_id ? category.team_name : null);
              }}
              required
              error={errors.category_id}
            />
            {newTeam && (
              <Alert severity="warning">
                This moves the incident to {newTeam}
                {incident.assignee_name ? ` and unassigns ${incident.assignee_name}` : ''}.
              </Alert>
            )}
            <LocationFields
              value={{ building_id: form.building_id, floor_id: form.floor_id, seat_id: form.seat_id }}
              onChange={(location) => setForm({ ...form, ...location })}
              errors={errors}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!form.title.trim() || !form.category_id || !form.building_id}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

EditIncidentDialog.propTypes = {
  incident: PropTypes.object.isRequired,
  errors: PropTypes.object,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

/**
 * Yes/no confirmation for something that cannot be undone.
 * @param {{title: string, text: string, confirmLabel: string, onCancel: function(): void,
 *   onConfirm: function(): void}} props
 */
export function ConfirmDialog({ title, text, confirmLabel, onCancel, onConfirm }) {
  return (
    <Dialog open onClose={onCancel} maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><DialogContentText>{text}</DialogContentText></DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}

ConfirmDialog.propTypes = {
  title: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
