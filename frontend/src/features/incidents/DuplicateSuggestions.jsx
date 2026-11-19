import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { findDuplicates, locationQuery } from '../../api/incidents';
import { StatusChip } from '../../components/IncidentChips';

/** Wait this long after the last keystroke before checking (ms). */
export const CHECK_DELAY = 400;

const isId = (value) => /^[1-9]\d*$/.test(value);

/**
 * "Possible duplicates" panel for the report form: active incidents with the same category, building and
 * floor. Shows nothing until category and building are valid, while checking, on error, or with no matches,
 * so it never gets in the way of reporting. Links open in a new tab so the draft is kept.
 * @param {{categoryId: string, buildingId: string, floorId: string}} props - the form's raw field values.
 */
export default function DuplicateSuggestions({ categoryId, buildingId, floorId }) {
  // The last answer and the query it was for; only shown while the fields still match that query.
  const [result, setResult] = useState({ query: '', matches: [] });
  const ready = isId(categoryId) && isId(buildingId) && (floorId === '' || isId(floorId));
  const query = ready ? locationQuery({ category_id: categoryId, building_id: buildingId, floor_id: floorId }) : '';

  useEffect(() => {
    if (!query) return undefined;
    let current = true; // ignore a slow answer that arrives after the fields changed again
    const timer = setTimeout(() => {
      findDuplicates(Object.fromEntries(new URLSearchParams(query)))
        .then((matches) => { if (current) setResult({ query, matches }); })
        .catch(() => { if (current) setResult({ query, matches: [] }); }); // a hint only: never block reporting
    }, CHECK_DELAY);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const matches = query && result.query === query ? result.matches : [];
  if (matches.length === 0) return null;
  return (
    <Alert severity="warning" role="region" aria-label="Possible duplicates">
      <AlertTitle>Possible duplicates</AlertTitle>
      <Typography variant="body2">
        {matches.length === 1 ? 'An open incident already exists' : `${matches.length} open incidents already exist`}{' '}
        for this category and place. Check before reporting it again.
      </Typography>
      <List dense disablePadding>
        {matches.map((match) => (
          <ListItem key={match.id} disableGutters>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Link
                component={RouterLink}
                to={`/incidents/${match.id}/summary?${query}`}
                target="_blank"
                rel="noopener"
              >
                #{match.id} {match.title}
              </Link>
              <StatusChip status={match.status} />
              <Typography variant="caption" color="text.secondary">
                reported {new Date(match.created_at).toLocaleDateString()}
              </Typography>
            </Stack>
          </ListItem>
        ))}
      </List>
    </Alert>
  );
}

DuplicateSuggestions.propTypes = {
  categoryId: PropTypes.string.isRequired,
  buildingId: PropTypes.string.isRequired,
  floorId: PropTypes.string.isRequired,
};
