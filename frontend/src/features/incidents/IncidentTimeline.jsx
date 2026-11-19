import { useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { describeEvent } from './eventText';

/**
 * Notes and history in one list, oldest first: notes as cards, events as small grey lines.
 * The author can edit a note; the author or an admin can delete it (the server checks both).
 * @param {{notes: object[], events: object[], user: object, locked: boolean,
 *   onEdit: function(object, string): Promise<void>, onDelete: function(object): Promise<void>}} props
 */
export default function IncidentTimeline({ notes, events, user, locked, onEdit, onDelete }) {
  const [editing, setEditing] = useState(null); // { id, body }
  const items = [
    ...notes.map((note) => ({ kind: 'note', key: `n${note.id}`, at: note.created_at, note })),
    ...events.map((event) => ({ kind: 'event', key: `e${event.id}`, at: event.created_at, event })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  if (items.length === 0) return <Typography color="text.secondary">Nothing here yet.</Typography>;

  return (
    <Stack spacing={1} component="ol" aria-label="Timeline" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {items.map((item) => (
        <Box component="li" key={item.key}>
          {item.kind === 'event' ? (
            <Typography variant="body2" color="text.secondary" sx={{ pl: 1 }}>
              {describeEvent(item.event)}
              {item.event.reason ? `: “${item.event.reason}”` : ''}
              {' · '}
              {new Date(item.at).toLocaleString()}
            </Typography>
          ) : (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2">
                {item.note.author_name}
                <Typography component="span" variant="caption" color="text.secondary">
                  {' · '}
                  {new Date(item.at).toLocaleString()}
                </Typography>
              </Typography>
              {editing?.id === item.note.id ? (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    multiline
                    minRows={2}
                    label="Edit note"
                    value={editing.body}
                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  />
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!editing.body.trim()}
                      onClick={() => onEdit(item.note, editing.body.trim()).then(() => setEditing(null))}
                    >
                      Save
                    </Button>
                    <Button size="small" onClick={() => setEditing(null)}>Cancel</Button>
                  </Stack>
                </Stack>
              ) : (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.note.body}</Typography>
              )}
              {editing?.id !== item.note.id && (
                <Stack direction="row" spacing={1}>
                  {!locked && item.note.author_id === user.id && (
                    <Button size="small" onClick={() => setEditing({ id: item.note.id, body: item.note.body })}>
                      Edit
                    </Button>
                  )}
                  {((!locked && item.note.author_id === user.id) || user.role === 'admin') && (
                    <Button size="small" color="error" onClick={() => onDelete(item.note)}>Delete</Button>
                  )}
                </Stack>
              )}
            </Paper>
          )}
        </Box>
      ))}
    </Stack>
  );
}

IncidentTimeline.propTypes = {
  notes: PropTypes.arrayOf(PropTypes.object).isRequired,
  events: PropTypes.arrayOf(PropTypes.object).isRequired,
  user: PropTypes.shape({ id: PropTypes.number, role: PropTypes.string }).isRequired,
  locked: PropTypes.bool.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
};
