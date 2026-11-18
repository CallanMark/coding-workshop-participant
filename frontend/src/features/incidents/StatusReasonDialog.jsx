import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

/**
 * Asks for the reason a status change needs (block, reopen, cancel).
 * Mount it only while a move is pending so the text starts empty each time.
 * @param {{title: string, onCancel: function(): void, onConfirm: function(string): void}} props
 */
export default function StatusReasonDialog({ title, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = !reason.trim();

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (!missing) onConfirm(reason.trim());
  };

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            margin="dense"
            label="Reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={touched && missing}
            helperText={touched && missing ? 'A reason is required for this change' : 'Shared with everyone on the incident as a note.'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained">Move</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

StatusReasonDialog.propTypes = {
  title: PropTypes.string.isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
};
