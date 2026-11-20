import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { findDuplicates, locationQuery } from '../../api/incidents';

/** Wait this long after the last keystroke before checking (ms). */
export const CHECK_DELAY = 400;

const isId = (value) => /^[1-9]\d*$/.test(value);

/** "Wi-Fi · HQ Tower › Floor 1 › 1-04": the category, then the place as far as it is known. */
const placeOf = (match) => [
  match.category_name,
  [match.building_name, match.floor_name, match.seat_code].filter(Boolean).join(' › '),
].join(' · ');

/**
 * "Possible duplicates" panel for the report form: active incidents with the same category, building and
 * floor. Shows nothing until category and building are valid, while checking, on error, or with no matches,
 * so it never gets in the way of reporting. Each match shows only its title, category and place, with no
 * link: the reporter may not be allowed to open it.
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
        for this category and place. It may already be reported.
      </Typography>
      <List dense disablePadding>
        {matches.map((match, index) => (
          // No id is sent (the reporter may not see these incidents), and the list is only ever replaced.
          <ListItem key={index} disableGutters>
            <ListItemText primary={match.title} secondary={placeOf(match)} />
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
