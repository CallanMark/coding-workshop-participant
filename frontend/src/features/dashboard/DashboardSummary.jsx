/**
 * The sections the team and engineer dashboards share: headline numbers, donuts of open work by status and
 * priority and of reports by category, response times, and the incidents waiting longest.
 */
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { EscalatedChip, PriorityChip, StatusChip } from '../../components/IncidentChips';
import { PRIORITIES } from '../../constants';
import {
  PRIORITY_COLORS, STATUS_COLORS, foldSlices,
} from './chartColors';
import { Section, StatCard, StatRow } from './DashboardParts';
import DonutChart from './DonutChart';
import { formatAge, formatDuration } from './format';

const STATUS_LABELS = { open: 'Not started', in_progress: 'In progress', blocked: 'Blocked' };

function Headlines({ open, speed, days }) {
  return (
    <Section title="At a glance" subtitle={`Open work right now, and activity over the last ${days} days`} wide>
      <StatRow>
        <StatCard label="Open now" value={open.total} />
        <StatCard label="Escalated" value={open.escalated} tone={open.escalated ? 'warning.main' : undefined} />
        <StatCard label="Blocked" value={open.by_status.blocked} tone={open.by_status.blocked ? 'error.main' : undefined} />
        <StatCard label={`Reported, ${days} days`} value={speed.reported} />
        <StatCard label={`Resolved, ${days} days`} value={speed.resolved} />
      </StatRow>
    </Section>
  );
}

function ByStatus({ open }) {
  const slices = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    id: key, label, value: open.by_status[key] ?? 0, color: STATUS_COLORS[key],
  }));
  return (
    <Section title="Open by status" subtitle="Where open incidents are in the workflow">
      <DonutChart slices={slices} totalLabel="open" emptyText="Nothing open." />
    </Section>
  );
}

function ByPriority({ open }) {
  const slices = Object.entries(PRIORITIES).map(([key, { label }]) => ({
    id: key, label, value: open.by_priority[key] ?? 0, color: PRIORITY_COLORS[key],
  })).reverse(); // most urgent first
  return (
    <Section title="Open by priority" subtitle="How urgent the open incidents are">
      <DonutChart slices={slices} totalLabel="open" emptyText="Nothing open." />
    </Section>
  );
}

function Categories({ categories, reported, days }) {
  // The API sends the top categories; whatever they don't cover of the window's reports is "Other".
  const slices = foldSlices(
    categories.map((c) => ({ id: c.id, label: `${c.name} (${c.type})`, value: c.incidents })),
    reported,
  );
  return (
    <Section title="Most common issues" subtitle={`Incidents reported in the last ${days} days, by category`}>
      <DonutChart slices={slices} totalLabel="reported" emptyText="No incidents reported in this window." />
    </Section>
  );
}

function Speed({ speed, days }) {
  const { acknowledge, assign, resolve } = speed.median_seconds;
  return (
    <Section title="Response times" subtitle={`Median time from report, over the last ${days} days`}>
      <StatRow>
        <StatCard label="To acknowledge" value={formatDuration(acknowledge)} />
        <StatCard label="To assign" value={formatDuration(assign)} />
        <StatCard label="To resolve" value={formatDuration(resolve)} />
      </StatRow>
    </Section>
  );
}

function WaitingLongest({ incidents }) {
  return (
    <Section title="Waiting longest" subtitle="The oldest incidents still open" wide>
      {incidents.length === 0 ? (
        <Typography color="text.secondary">Nothing open. Nice work.</Typography>
      ) : (
        <List dense disablePadding>
          {incidents.map((incident) => (
            <ListItem key={incident.id} disableGutters divider>
              <ListItemText
                primary={(
                  <Link component={RouterLink} to={`/incidents/${incident.id}`}>
                    #{incident.id} {incident.title}
                  </Link>
                )}
                secondary={`${incident.assignee_name || 'Unassigned'} · reported ${formatAge(incident.created_at)}`}
              />
              <Stack direction="row" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                {incident.is_escalated && <EscalatedChip />}
                <StatusChip status={incident.status} />
                <PriorityChip priority={incident.priority} />
              </Stack>
            </ListItem>
          ))}
        </List>
      )}
    </Section>
  );
}

/**
 * Every shared section, in grid order. Place inside a DashboardGrid.
 * @param {{dashboard: {days: number, open: object, speed: object, categories: object[], oldest_open: object[]}}} props
 */
export default function DashboardSummary({ dashboard }) {
  return (
    <>
      <Headlines open={dashboard.open} speed={dashboard.speed} days={dashboard.days} />
      <ByStatus open={dashboard.open} />
      <ByPriority open={dashboard.open} />
      <Categories categories={dashboard.categories} reported={dashboard.speed.reported} days={dashboard.days} />
      <Speed speed={dashboard.speed} days={dashboard.days} />
      <WaitingLongest incidents={dashboard.oldest_open} />
    </>
  );
}

const openShape = PropTypes.shape({
  total: PropTypes.number.isRequired,
  escalated: PropTypes.number.isRequired,
  by_status: PropTypes.objectOf(PropTypes.number).isRequired,
  by_priority: PropTypes.objectOf(PropTypes.number).isRequired,
});

const speedShape = PropTypes.shape({
  reported: PropTypes.number.isRequired,
  resolved: PropTypes.number.isRequired,
  median_seconds: PropTypes.objectOf(PropTypes.number).isRequired,
});

Headlines.propTypes = { open: openShape.isRequired, speed: speedShape.isRequired, days: PropTypes.number.isRequired };
ByStatus.propTypes = { open: openShape.isRequired };
ByPriority.propTypes = { open: openShape.isRequired };
Speed.propTypes = { speed: speedShape.isRequired, days: PropTypes.number.isRequired };
Categories.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.object).isRequired,
  reported: PropTypes.number.isRequired,
  days: PropTypes.number.isRequired,
};
WaitingLongest.propTypes = { incidents: PropTypes.arrayOf(PropTypes.object).isRequired };
DashboardSummary.propTypes = {
  dashboard: PropTypes.shape({
    days: PropTypes.number.isRequired,
    open: openShape.isRequired,
    speed: PropTypes.object.isRequired,
    categories: PropTypes.array.isRequired,
    oldest_open: PropTypes.array.isRequired,
  }).isRequired,
};
