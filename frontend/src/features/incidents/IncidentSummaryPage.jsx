import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getIncident, getIncidentSummary } from '../../api/incidents';
import { PriorityChip, StatusChip } from '../../components/IncidentChips';

/**
 * Read-only summary of a possible duplicate, opened from the report form's suggestions.
 * The server only returns it while it matches the category and place in the URL. If the user may also
 * see the full incident (theirs, their team's, or admin), a button links to it.
 */
export default function IncidentSummaryPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, summary: null, canOpen: false });

  useEffect(() => {
    let ignore = false;
    const location = Object.fromEntries(new URLSearchParams(query));
    // The summary is what this page shows; the full incident only decides whether to offer a link to it.
    Promise.allSettled([getIncidentSummary(id, location), getIncident(id)]).then(([summary, full]) => {
      if (ignore) return;
      if (summary.status === 'rejected') {
        setState({ loading: false, error: summary.reason, summary: null, canOpen: false });
      } else {
        setState({ loading: false, error: null, summary: summary.value, canOpen: full.status === 'fulfilled' });
      }
    });
    return () => {
      ignore = true;
    };
  }, [id, query, reloadKey]);

  const retry = () => {
    setState((prev) => ({ ...prev, loading: true }));
    setReloadKey((key) => key + 1);
  };

  const { loading, error, summary, canOpen } = state;
  if (loading) return <CircularProgress aria-label="Loading incident" />;
  if (error) {
    return error.status === 404 ? (
      <Alert severity="info">This incident is no longer open at that place, or it does not exist.</Alert>
    ) : (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={retry}>Retry</Button>}>
        {error.message}
      </Alert>
    );
  }

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
