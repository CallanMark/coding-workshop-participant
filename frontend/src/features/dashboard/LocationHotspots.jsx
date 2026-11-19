/**
 * Admin: the buildings, floors and seats with the most recurring issues in the window.
 * Recurring = the same category was already reported at the same place in the 30 days before.
 */
import PropTypes from 'prop-types';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { getLocationHotspots } from '../../api/analytics';
import useApiList from '../../hooks/useApiList';
import { Loaded, Section } from './DashboardParts';

const LEVELS = [
  { key: 'buildings', title: 'Buildings', place: (row) => row.name },
  { key: 'floors', title: 'Floors', place: (row) => `${row.building_name} · ${row.name}` },
  { key: 'seats', title: 'Seats', place: (row) => `${row.building_name} · ${row.floor_name} · ${row.code}` },
];

function Ranking({ title, rows, place }) {
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <Typography color="text.secondary">No incidents with a {title.toLowerCase().slice(0, -1)} in this window.</Typography>
      ) : (
        <Table size="small" aria-label={`${title} hotspots`}>
          <TableHead>
            <TableRow>
              <TableCell>Place</TableCell>
              <TableCell align="right">Recurring</TableCell>
              <TableCell align="right">Incidents</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{place(row)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: row.recurring ? 600 : undefined }}>{row.recurring}</TableCell>
                <TableCell align="right">{row.incidents}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

Ranking.propTypes = {
  title: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  place: PropTypes.func.isRequired,
};

/**
 * One ranking per level, inside the caller's DashboardGrid.
 * @param {{days: string}} props
 */
export default function LocationHotspots({ days }) {
  const hotspots = useApiList(getLocationHotspots, days);
  return (
    <>
      <Typography variant="h6" component="h2" sx={{ gridColumn: '1 / -1', mt: 2 }}>
        Location hotspots
        <Typography variant="body2" color="text.secondary" component="span" sx={{ display: 'block' }}>
          Places ranked by recurring issues: the same category reported at the same place within 30 days.
        </Typography>
      </Typography>
      <Loaded result={hotspots} label="location hotspots">
        {(data) => LEVELS.map(({ key, title, place }) => (
          <Ranking key={key} title={title} rows={data[key]} place={place} />
        ))}
      </Loaded>
    </>
  );
}

LocationHotspots.propTypes = { days: PropTypes.string.isRequired };
