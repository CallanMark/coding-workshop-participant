import { useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Rating from '@mui/material/Rating';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getFeedback, saveFeedback } from '../../api/incidents';
import useApi from '../../hooks/useApi';

// useApi loads by one key, "<incident id>/<status>".
const loadFeedback = (key) => getFeedback(key.split('/')[0]);

/**
 * The reporter's private feedback on the engineer who did the work.
 * The reporter can give it once the incident is resolved and change it until it is closed; the engineer's
 * manager and admins can read it. The server refuses everyone else (403), and the card then renders nothing,
 * so the engineer never even sees that it exists.
 * @param {{incident: object, user: object}} props
 */
export default function FeedbackCard({ incident, user }) {
  // Reload when the status changes (resolving it opens feedback). An error (403) hides the card.
  const loaded = useApi(loadFeedback, `${incident.id}/${incident.status}`);
  const [draft, setDraft] = useState(null); // { rating, comment } while the reporter edits
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const feedback = loaded.status === 'ready' ? loaded.data : null;
  const done = ['resolved', 'closed'].includes(incident.status);
  if (loaded.status !== 'ready' || (!done && !feedback)) return null;

  const isReporter = incident.reporter_id === user.id;
  const canGive = isReporter && done && incident.assignee_id != null
    && !(incident.status === 'closed' && feedback);
  const engineer = feedback?.engineer_name || incident.assignee_name || 'the engineer';

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveFeedback(incident.id, { rating: draft.rating, comment: draft.comment.trim() });
      loaded.setData(saved);
      setDraft(null);
      setMessage({ severity: 'success', text: 'Thanks, your feedback was saved.' });
    } catch (error) {
      setMessage({ severity: 'error', text: Object.values(error.details || {})[0] || error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} component="section" aria-label="Private feedback">
      <Stack spacing={1}>
        <Typography variant="h6" component="h2">Private feedback</Typography>
        <Typography variant="caption" color="text.secondary">
          {isReporter
            ? `How did ${engineer} do? Only their manager and admins see this, not ${engineer}.`
            : `From the reporter about ${engineer}. ${engineer} cannot see this.`}
        </Typography>
        {message && <Alert severity={message.severity}>{message.text}</Alert>}

        {draft ? (
          <>
            <Rating
              name="rating"
              value={draft.rating}
              onChange={(_, rating) => setDraft({ ...draft, rating })}
              aria-label="Rating"
            />
            <TextField
              label="Comment (optional)"
              multiline
              minRows={2}
              value={draft.comment}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={!draft.rating || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save feedback'}
              </Button>
              <Button onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            </Stack>
          </>
        ) : (
          <>
            {feedback ? (
              <>
                <Rating value={feedback.rating} readOnly aria-label={`Rated ${feedback.rating} out of 5`} />
                {feedback.comment && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{feedback.comment}</Typography>}
                {!isReporter && (
                  <Typography variant="caption" color="text.secondary">From {feedback.reporter_name}</Typography>
                )}
              </>
            ) : (
              <Typography color="text.secondary">No feedback yet.</Typography>
            )}
            {canGive && (
              <Button
                sx={{ alignSelf: 'start' }}
                variant={feedback ? 'text' : 'contained'}
                onClick={() => setDraft({ rating: feedback?.rating || 0, comment: feedback?.comment || '' })}
              >
                {feedback ? 'Change feedback' : 'Give feedback'}
              </Button>
            )}
            {isReporter && feedback && incident.status === 'closed' && (
              <Typography variant="caption" color="text.secondary">Locked now that the incident is closed.</Typography>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}

FeedbackCard.propTypes = {
  incident: PropTypes.shape({
    id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    reporter_id: PropTypes.number.isRequired,
    assignee_id: PropTypes.number,
    assignee_name: PropTypes.string,
  }).isRequired,
  user: PropTypes.shape({ id: PropTypes.number.isRequired }).isRequired,
};
