import { useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { PriorityChip, StatusChip } from '../../components/IncidentChips';
import { describeEvent, eventColor, formatWhen } from './eventText';

/** "→" between the old and new value of a change. */
function Arrow() {
  return <Typography component="span" aria-label="to" sx={{ mx: 0.5, fontWeight: 700, color: 'text.secondary' }}>→</Typography>;
}

/**
 * What an event says, with chips for statuses and priorities. The full sentence (describeEvent) is the
 * accessible name, so screen readers hear "Tina Tech moved it from Open to In progress".
 * @param {{event: object}} props
 */
function EventContent({ event }) {
  const who = <strong>{event.actor_name || 'Someone'}</strong>;
  let body;
  switch (event.event_type) {
    case 'status_changed':
      body = <>{who} moved it <StatusChip status={event.from_value} /><Arrow /><StatusChip status={event.to_value} /></>;
      break;
    case 'priority_changed':
      body = <>{who} changed priority <PriorityChip priority={event.from_value} /><Arrow /><PriorityChip priority={event.to_value} /></>;
      break;
    case 'escalated':
      body = event.to_value === 'true'
        ? <>{who} escalated it <Chip size="small" color="error" label="Escalated" /></>
        : <>{who} cleared the escalation</>;
      break;
    default:
      // created / assigned / team_changed read fine as a sentence; bold who did it.
      body = <>{who}{describeEvent(event).slice((event.actor_name || 'Someone').length)}</>;
  }
  return (
    <Box>
      <Box aria-label={describeEvent(event)} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        {body}
      </Box>
      {event.reason && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 0.5 }}>
          “{event.reason}”
        </Typography>
      )}
    </Box>
  );
}

EventContent.propTypes = { event: PropTypes.object.isRequired };

/** Bold "14:05 Monday", then the date. */
function When({ value }) {
  const { when, date } = formatWhen(value);
  return (
    <Typography variant="body2" component="time" dateTime={value} sx={{ whiteSpace: 'nowrap' }}>
      <strong>{when}</strong> {date}
    </Typography>
  );
}

When.propTypes = { value: PropTypes.string.isRequired };

/**
 * Notes and history as one vertical timeline, oldest first: time on the left, a coloured dot on a line,
 * then the event or note. The author can edit a note; the author or an admin can delete it (the server checks).
 * @param {{notes: object[], events: object[], user: object, locked: boolean,
 *   onEdit: function(object, string): Promise<boolean>, onDelete: function(object): Promise<boolean>}} props
 */
export default function IncidentTimeline({ notes, events, user, locked, onEdit, onDelete }) {
  const [editing, setEditing] = useState(null); // { id, body }
  const items = [
    ...notes.map((note) => ({ kind: 'note', key: `n${note.id}`, at: note.created_at, note })),
    ...events.map((event) => ({ kind: 'event', key: `e${event.id}`, at: event.created_at, event })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  if (items.length === 0) return <Typography color="text.secondary">Nothing here yet.</Typography>;

  const noteCard = (note) => (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
      <Typography variant="subtitle2">{note.author_name}</Typography>
      {editing?.id === note.id ? (
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
              onClick={() => onEdit(note, editing.body.trim()).then((ok) => ok !== false && setEditing(null))}
            >
              Save
            </Button>
            <Button size="small" onClick={() => setEditing(null)}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{note.body}</Typography>
          <Stack direction="row" spacing={1}>
            {!locked && note.author_id === user.id && (
              <Button size="small" onClick={() => setEditing({ id: note.id, body: note.body })}>Edit</Button>
            )}
            {((!locked && note.author_id === user.id) || user.role === 'admin') && (
              <Button size="small" color="error" onClick={() => onDelete(note)}>Delete</Button>
            )}
          </Stack>
        </>
      )}
    </Paper>
  );

  return (
    <Box component="ol" aria-label="Timeline" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const isNote = item.kind === 'note';
        const color = isNote ? 'grey' : eventColor(item.event);
        return (
          <Box
            component="li"
            key={item.key}
            sx={{
              display: 'grid',
              // time | dot and line | content; on phones the time sits above the content.
              gridTemplateColumns: { xs: '20px 1fr', sm: '150px 20px 1fr' },
              columnGap: 1.5,
            }}
          >
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right', pt: 0.25 }}>
              <When value={item.at} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box
                aria-hidden
                sx={{
                  mt: 0.75,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: isNote ? 'background.paper' : `${color}.main`,
                  border: 2,
                  borderColor: isNote ? 'text.secondary' : `${color}.main`,
                }}
              />
              {!last && <Box aria-hidden sx={{ flexGrow: 1, width: 2, bgcolor: 'divider', my: 0.5 }} />}
            </Box>
            <Box sx={{ pb: last ? 0 : 2, minWidth: 0 }}>
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}><When value={item.at} /></Box>
              {isNote ? noteCard(item.note) : <EventContent event={item.event} />}
            </Box>
          </Box>
        );
      })}
    </Box>
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
