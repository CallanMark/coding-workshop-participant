import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { PRIORITIES } from '../../constants';

/**
 * Assign an engineer by id (team manager or admin). The server checks they are an active, available
 * engineer on the incident's team and names the problem otherwise.
 * TODO: pick from a list of the team's engineers once a people endpoint exists.
 * Mount only while open so the form starts fresh.
 * @param {{incident: object, error?: string, onCancel: function(): void, onConfirm: function(number|null): void}} props
 */
export function AssignDialog({ incident, error = '', onCancel, onConfirm }) {
  const [value, setValue] = useState(incident.assignee_id ? String(incident.assignee_id) : '');
  const valid = /^[1-9]\d*$/.test(value);
  const submit = (event) => {
    event.preventDefault();
    if (valid) onConfirm(Number(value));
  };
  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Assign #{incident.id}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Engineer ID"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={Boolean(error)}
            helperText={error || `An available engineer on ${incident.team_name}.`}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
        </DialogContent>
        <DialogActions>
          {incident.assignee_id && incident.status === 'open' && (
            <Button color="warning" onClick={() => onConfirm(null)} sx={{ mr: 'auto' }}>Unassign</Button>
          )}
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid}>Assign</Button>
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

/**
 * Edit title, description and priority; only changed fields are sent.
 * @param {{incident: object, errors?: object, onCancel: function(): void, onConfirm: function(object): void}} props
 */
export function EditIncidentDialog({ incident, errors = {}, onCancel, onConfirm }) {
  const [form, setForm] = useState({
    title: incident.title, description: incident.description || '', priority: incident.priority,
  });
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = (event) => {
    event.preventDefault();
    const changes = {};
    if (form.title.trim() !== incident.title) changes.title = form.title.trim();
    if (form.description.trim() !== (incident.description || '')) changes.description = form.description.trim();
    if (form.priority !== incident.priority) changes.priority = form.priority;
    if (Object.keys(changes).length === 0) onCancel();
    else onConfirm(changes);
  };
  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm">
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!form.title.trim()}>Save</Button>
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
