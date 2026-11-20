/**
 * Team dashboard (/dashboard), the landing page for engineers, managers and admins, titled by the team
 * (e.g. "Workplace Technology dashboard").
 * - Engineers and managers see their own team. Engineers also get a link to their own dashboard.
 * - Managers and admins also see the team's workload, with links to each engineer's dashboard.
 * - Admins pick the team (?team=, default the first) and also see location hotspots.
 */
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getTeamDashboard } from '../../api/analytics';
import { listTeams } from '../../api/facilities';
import { hasRole, useAuth } from '../../context/auth';
import Loaded from '../../components/Loaded';
import TeamSelect from '../../components/TeamSelect';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { DashboardGrid, WindowPicker } from './DashboardParts';
import DashboardSummary from './DashboardSummary';
import LocationHotspots from './LocationHotspots';
import useWindow from './useWindow';
import Workload from './Workload';

// useApi loads by one key, so the team and window travel together as "teamId/days".
const loadTeamDashboard = (key) => getTeamDashboard(...key.split('/'));

function TeamDashboard({ teamId, days, teamPicker }) {
  const { user } = useAuth();
  const [, setDays] = useWindow();
  const dashboard = useApi(loadTeamDashboard, `${teamId}/${days}`);
  const name = dashboard.status === 'ready' ? dashboard.data.team.name : '';
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {name ? `${name} dashboard` : 'Team dashboard'}
        </Typography>
        {teamPicker}
        {hasRole(user, 'engineer') && (
          <Button component={RouterLink} to={`/dashboard/engineers/${user.id}?days=${days}`} variant="outlined">
            My dashboard
          </Button>
        )}
        <WindowPicker days={days} onChange={setDays} />
      </Stack>
      <DashboardGrid>
        <Loaded result={dashboard} label="team dashboard">
          {(data) => <DashboardSummary dashboard={data} />}
        </Loaded>
        {hasRole(user, 'manager', 'admin') && <Workload teamId={teamId} />}
        {hasRole(user, 'admin') && <LocationHotspots days={days} />}
      </DashboardGrid>
    </Stack>
  );
}

TeamDashboard.propTypes = {
  teamId: PropTypes.string.isRequired,
  days: PropTypes.string.isRequired,
  teamPicker: PropTypes.node,
};

/** Admins: choose any team; the choice is kept in the URL as ?team=. */
function AdminTeamDashboard({ days }) {
  const [params, update] = useQueryParams();
  const teams = useApi(listTeams, 'all');
  return (
    <Loaded result={teams} label="teams">
      {(rows) => {
        if (rows.length === 0) return <Typography>No teams yet.</Typography>;
        const chosen = rows.some((t) => String(t.id) === params.get('team')) ? params.get('team') : String(rows[0].id);
        const picker = <TeamSelect teams={rows} value={chosen} onChange={(team) => update({ team })} />;
        return <TeamDashboard teamId={chosen} days={days} teamPicker={picker} />;
      }}
    </Loaded>
  );
}

AdminTeamDashboard.propTypes = { days: PropTypes.string.isRequired };

export default function TeamDashboardPage() {
  const { user } = useAuth();
  const [days] = useWindow();
  if (hasRole(user, 'admin')) return <AdminTeamDashboard days={days} />;
  if (!user.team_id) return <Typography>You aren&apos;t on a team yet, so there is no team dashboard.</Typography>;
  return <TeamDashboard teamId={String(user.team_id)} days={days} />;
}
