/**
 * Dialogs for the engineers admin page: create or edit an engineer, and confirm deactivating or reactivating.
 * Each shows the server's message and field errors (e.g. "An account with this email already exists").
 * Mount only while open so the form starts fresh.
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

const MIN_PASSWORD = 8;

const engineerShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  name: PropTypes.string.isRequired,
  team_id: PropTypes.number,
  is_active: PropTypes.bool,
});

/**
 * Create an engineer (name, email, temporary password, team) or edit one (name, team).
 * onSave gets only what to send: everything when creating, just the changed fields when editing.
 * @param {{engineer?: object, teams: Array<{id: number, name: string}>, teamId?: number,
 *   onCancel: function(): void, onSave: function(object): Promise<void>}} props - onSave rejects with an ApiError.
 */
export function EngineerFormDialog({
  engineer, teams, teamId, onCancel, onSave,
}) {
  const creating = !engineer;
  const [values, setValues] = useState({
    name: engineer?.name ?? '',
    email: '',
    password: '',
    team_id: String(engineer?.team_id ?? teamId ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState({ message: '', details: {} });

  const set = (name) => (event) => setValues((prev) => ({ ...prev, [name]: event.target.value }));
  const complete = values.name.trim() && values.team_id
    && (!creating || (values.email.trim() && values.password.length >= MIN_PASSWORD));

  const changes = () => {
    const all = {
      name: values.name.trim(),
      team_id: Number(values.team_id),
      ...(creating && { email: values.email.trim(), password: values.password }),
    };
    if (creating) return all;
    return Object.fromEntries(Object.entries(all).filter(([key, value]) => value !== engineer[key]));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!complete) return;
    const body = changes();
    if (Object.keys(body).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(body);
    } catch (err) {
      setError({ message: err.message, details: err.details || {} });
      setSaving(false);
    }
  };

  const field = (name, label, { helperText, ...props } = {}) => (
    <TextField
      fullWidth
      required
      margin="dense"
      label={label}
      value={values[name]}
      onChange={set(name)}
      error={Boolean(error.details[name])}
      helperText={error.details[name] || helperText}
      {...props}
    />
  );

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{creating ? 'Add engineer' : `Edit ${engineer.name}`}</DialogTitle>
        <DialogContent>
          {error.message && <Alert severity="error" sx={{ mb: 1 }}>{error.message}</Alert>}
          {field('name', 'Name', { autoFocus: true, slotProps: { htmlInput: { maxLength: 100 } } })}
          {creating && field('email', 'Email', { type: 'email', placeholder: 'name@acme.inc' })}
          {creating && field('password', 'Temporary password', {
            helperText: `At least ${MIN_PASSWORD} characters. Share it with them so they can sign in.`,
            autoComplete: 'new-password',
          })}
          {field('team_id', 'Team', {
            select: true,
            children: teams.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>),
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!complete || saving}>
            {saving ? 'Saving…' : (creating ? 'Add' : 'Save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

EngineerFormDialog.propTypes = {
  engineer: engineerShape,
  teams: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })).isRequired,
  teamId: PropTypes.number,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

/**
 * Confirm deactivating (can't sign in or be assigned; history kept) or reactivating an engineer.
 * The server refuses to deactivate someone still holding open incidents; that message shows here.
 * @param {{engineer: object, onCancel: function(): void, onConfirm: function(): Promise<void>}} props
 */
export function EngineerStatusDialog({ engineer, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deactivating = engineer.is_active;
  const verb = deactivating ? 'Deactivate' : 'Reactivate';

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{verb} {engineer.name}?</DialogTitle>
      <DialogContent>
        {error ? <Alert severity="error">{error}</Alert> : (
          <DialogContentText>
            {deactivating
              ? 'They won’t be able to sign in or be assigned incidents. Their history is kept, and you can reactivate them later.'
              : 'They’ll be able to sign in and be assigned incidents again.'}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{error ? 'Close' : 'Cancel'}</Button>
        {!error && (
          <Button variant="contained" color={deactivating ? 'error' : 'primary'} onClick={confirm} disabled={busy}>
            {busy ? `${verb.slice(0, -1)}ing…` : verb}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

EngineerStatusDialog.propTypes = {
  engineer: engineerShape.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
