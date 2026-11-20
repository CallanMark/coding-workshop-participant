/**
 * A form in a dialog, described by a list of fields: used for facilities and engineer profiles.
 * Every field is required. The server's message (e.g. "A building called HQ Tower already exists") shows at
 * the top and its field messages under the fields. Mount only while open so the form starts fresh.
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

const MAX_LENGTH = 100;

const fieldShape = PropTypes.shape({
  name: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  /** Makes it a dropdown. */
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })),
  /** Input type, e.g. "email". */
  type: PropTypes.string,
  /** Hint under the field (a server field error replaces it). */
  helperText: PropTypes.string,
  autoComplete: PropTypes.string,
  /** Save stays disabled until the value is at least this long. */
  minLength: PropTypes.number,
});

/**
 * @param {{title: string, fields: object[], initial: object, submitLabel?: string,
 *   onCancel: function(): void, onSave: function(object): Promise<void>}} props
 *   onSave gets the form values; it rejects with the ApiError to show.
 */
export default function FormDialog({
  title, fields, initial, submitLabel = 'Save', onCancel, onSave,
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState({ message: '', details: {} });
  const complete = fields.every(({ name, minLength = 1 }) => {
    const value = String(values[name] ?? '');
    return value.trim() !== '' && value.length >= minLength;
  });

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
          {fields.map(({
            name, label, options, type, helperText, autoComplete,
          }, index) => (
            <TextField
              key={name}
              select={Boolean(options)}
              type={type}
              autoComplete={autoComplete}
              autoFocus={index === 0}
              fullWidth
              required
              margin="dense"
              label={label}
              value={values[name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              error={Boolean(error.details[name])}
              helperText={error.details[name] || helperText}
              slotProps={{ htmlInput: { maxLength: MAX_LENGTH } }}
            >
              {options?.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!complete || saving}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

FormDialog.propTypes = {
  title: PropTypes.string.isRequired,
  fields: PropTypes.arrayOf(fieldShape).isRequired,
  initial: PropTypes.object.isRequired,
  submitLabel: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};
