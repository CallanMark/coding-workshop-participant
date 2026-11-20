import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getIncident, getIncidentSummary } from '../../api/incidents';
import { PriorityChip, StatusChip } from '../../components/IncidentChips';
import Loaded from '../../components/Loaded';
import useApi from '../../hooks/useApi';

/**
 * The summary (what this page shows) and whether the full incident is visible too (only decides whether to
 * offer a link to it). useApi loads by one key, "<id>?<location query>".
 */
const loadSummary = (key) => {
  const [id, query] = key.split('?');
  const location = Object.fromEntries(new URLSearchParams(query));
  return Promise.allSettled([getIncidentSummary(id, location), getIncident(id)]).then(([summary, full]) => {
    if (summary.status === 'rejected') throw summary.reason;
    return { summary: summary.value, canOpen: full.status === 'fulfilled' };
  });
};

/**
 * Read-only summary of a possible duplicate, opened from the report form's suggestions.
 * The server only returns it while it matches the category and place in the URL. If the user may also
 * see the full incident (theirs, their team's, or admin), a button links to it.
 */
export default function IncidentSummaryPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  const loaded = useApi(loadSummary, `${id}?${query}`);
  if (loaded.status !== 'ready') {
    return (
      <Loaded
        result={loaded}
        label="incident"
        notFound={<Alert severity="info">This incident is no longer open at that place, or it does not exist.</Alert>}
      >
        {() => null}
      </Loaded>
    );
  }

  const { summary, canOpen } = loaded.data;

  const place = [summary.building_name, summary.floor_name].filter(Boolean).join(', ');
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Stack spacing={2}>
        <Typography variant="overline" color="text.secondary">Possible duplicate · #{summary.id}</Typography>
        <Typography variant="h5" component="h1">{summary.title}</Typography>
        <Stack direction="row" spacing={1}>
          <StatusChip status={summary.status} />
          <PriorityChip priority={summary.priority} />
        </Stack>
        <Typography><strong>Category:</strong> {summary.category_name}</Typography>
        <Typography><strong>Location:</strong> {place}</Typography>
        <Typography><strong>Reported:</strong> {new Date(summary.created_at).toLocaleString()}</Typography>
        <Alert severity="info">
          Someone is already tracking this. If it is the same problem, there is no need to report it again.
        </Alert>
        {canOpen && (
          <Button component={RouterLink} to={`/incidents/${summary.id}`} variant="contained" sx={{ alignSelf: 'start' }}>
            Open full incident
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
