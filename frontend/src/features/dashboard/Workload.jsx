/**
 * Who is available on a team and how open work is spread across them (team manager or admin):
 * a table beside a donut of each engineer's share. The table's swatches are the donut's legend.
 * Each name links to that engineer's dashboard.
 */
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { listEngineers } from '../../api/incidents';
import useApiList from '../../hooks/useApiList';
import { OTHER, SERIES, share } from './chartColors';
import { Loaded, Section } from './DashboardParts';
import DonutChart, { Swatch } from './DonutChart';

// Engineers come sorted by name, so each keeps their colour as workloads change; past the
// palette they share the grey "Other" slice.
const colorOf = (index) => SERIES[index] ?? OTHER;

function WorkloadTable({ engineers, total }) {
  return (
    <Table size="small" aria-label="Team workload" sx={{ flex: '3 1 320px' }}>
      <TableHead>
        <TableRow>
          <TableCell>Engineer</TableCell>
          <TableCell>Availability</TableCell>
          <TableCell align="right">Open</TableCell>
          <TableCell align="right">Share</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {engineers.map((engineer, index) => (
          <TableRow key={engineer.id}>
            <TableCell>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Swatch color={colorOf(index)} />
                <Link component={RouterLink} to={`/dashboard/engineers/${engineer.id}`}>{engineer.name}</Link>
              </Stack>
            </TableCell>
            <TableCell>
              <Chip
                size="small"
                variant="outlined"
                color={engineer.is_available ? 'success' : 'default'}
                label={engineer.is_available ? 'Available' : 'Unavailable'}
              />
            </TableCell>
            <TableCell align="right">{engineer.open_incidents}</TableCell>
            <TableCell align="right">{share(engineer.open_incidents, total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

WorkloadTable.propTypes = {
  engineers: PropTypes.arrayOf(PropTypes.object).isRequired,
  total: PropTypes.number.isRequired,
};

/** @param {{teamId: string}} props */
export default function Workload({ teamId }) {
  const engineers = useApiList(listEngineers, teamId);
  return (
    <Section title="Team workload" subtitle="Active engineers and their share of the team's open incidents" wide>
      <Loaded result={engineers} label="team workload">
        {(rows) => {
          if (rows.length === 0) return <Typography color="text.secondary">No active engineers on this team.</Typography>;
          const total = rows.reduce((sum, e) => sum + e.open_incidents, 0);
          const slices = rows.map((e, index) => ({
            id: e.id, label: e.name, value: e.open_incidents, color: colorOf(index),
          }));
          return (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
              <WorkloadTable engineers={rows} total={total} />
              <Stack sx={{ flex: '2 1 200px', alignItems: 'center' }}>
                <DonutChart slices={slices} totalLabel="assigned" emptyText="No open incidents assigned." legend={false} />
              </Stack>
            </Stack>
          );
        }}
      </Loaded>
    </Section>
  );
}

Workload.propTypes = { teamId: PropTypes.string.isRequired };
