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

const fieldShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })),
});

/**
 * Add or edit form for a facility row. Every field is required; `options` makes it a dropdown.
 * The server's message (e.g. "A building called HQ Tower already exists") shows at the top and its
 * field messages under the fields. Mount only while open so the form starts fresh.
 * @param {{title: string, fields: object[], initial: object, onCancel: function(): void,
 *   onSave: function(object): Promise<void>}} props - onSave rejects with the ApiError to show.
 */
export function FacilityFormDialog({ title, fields, initial, onCancel, onSave }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState({ message: '', details: {} });
  const complete = fields.every(({ name }) => String(values[name] ?? '').trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!complete) return;
    setSaving(true);
    try {
      await onSave(values);
    } catch (err) {
      setError({ message: err.message, details: err.details || {} });
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {error.message && <Alert severity="error" sx={{ mb: 1 }}>{error.message}</Alert>}
          {fields.map(({ name, label, options }, index) => (
            <TextField
              key={name}
              select={Boolean(options)}
              autoFocus={index === 0}
              fullWidth
              required
              margin="dense"
              label={label}
              value={values[name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              error={Boolean(error.details[name])}
              helperText={error.details[name]}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            >
              {options?.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!complete || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

FacilityFormDialog.propTypes = {
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(fieldShape).isRequired,
  initial: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

/**
 * Confirm a delete. The server refuses rows still in use ("Used by 3 incidents, so it can't be deleted");
 * that message shows here. Mount only while open.
 * @param {{name: string, onCancel: function(): void, onConfirm: function(): Promise<void>}} props
 */
export function DeleteFacilityDialog({ name, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Delete {name}?</DialogTitle>
      <DialogContent>
        {error
          ? <Alert severity="error">{error}</Alert>
          : <DialogContentText>This can&apos;t be undone.</DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{error ? 'Close' : 'Cancel'}</Button>
        {!error && (
          <Button color="error" variant="contained" onClick={confirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

DeleteFacilityDialog.propTypes = {
  name: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
