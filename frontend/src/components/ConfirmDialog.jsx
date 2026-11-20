/**
 * "Are you sure?" for an action such as delete or deactivate. While it runs the button shows `busyLabel`;
 * if it fails, the server's message (e.g. "Used by 3 incidents, so it can't be deleted") replaces the text
 * and the dialog offers Close. Mount only while open.
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

/**
 * @param {{title: string, text: string, confirmLabel: string, busyLabel: string, color?: string,
 *   onCancel: function(): void, onConfirm: function(): Promise<void>}} props - onConfirm rejects with the error.
 */
export default function ConfirmDialog({
  title, text, confirmLabel, busyLabel, color = 'error', onCancel, onConfirm,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {error ? <Alert severity="error">{error}</Alert> : <DialogContentText>{text}</DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{error ? 'Close' : 'Cancel'}</Button>
        {!error && (
          <Button color={color} variant="contained" onClick={confirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

ConfirmDialog.propTypes = {
  title: PropTypes.string.isRequired,
  text: PropTypes.string.isRequired,
  confirmLabel: PropTypes.string.isRequired,
  busyLabel: PropTypes.string.isRequired,
  color: PropTypes.string,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
