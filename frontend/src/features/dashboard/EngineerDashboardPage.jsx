/**
 * One engineer's dashboard (/dashboard/engineers/:id): their open work, speed and categories.
 * Seen by the engineer, their team's manager or an admin (the server enforces this).
 * Reporter feedback only comes back when someone else is looking, so engineers never see their own ratings.
 */
import PropTypes from 'prop-types';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Rating from '@mui/material/Rating';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getEngineerDashboard } from '../../api/analytics';
import { hasRole, useAuth } from '../../context/auth';
import useApiList from '../../hooks/useApiList';
import {
  DashboardGrid, Loaded, Section, WindowPicker,
} from './DashboardParts';
import DashboardSummary from './DashboardSummary';
import { formatAge } from './format';
import useWindow from './useWindow';

// useApiList loads by one key, so the engineer and window travel together as "id/days".
const loadEngineerDashboard = (key) => getEngineerDashboard(...key.split('/'));

function Feedback({ feedback }) {
  return (
    <Section title="Reporter feedback" subtitle="Ratings from the people whose incidents they resolved, all time" wide>
      {feedback.ratings === 0 ? (
        <Typography color="text.secondary">No feedback yet.</Typography>
      ) : (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Rating value={feedback.average} precision={0.1} readOnly aria-label={`Average rating ${feedback.average} out of 5`} />
            <Typography>
              <strong>{feedback.average}</strong> average from {feedback.ratings} rating{feedback.ratings === 1 ? '' : 's'}
            </Typography>
          </Stack>
          <List dense disablePadding>
            {feedback.recent.map((item) => (
              <ListItem key={item.incident_id} disableGutters divider sx={{ alignItems: 'flex-start' }}>
                <ListItemText
                  primary={(
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Rating value={item.rating} size="small" readOnly aria-label={`${item.rating} out of 5`} />
                      <Link component={RouterLink} to={`/incidents/${item.incident_id}`}>
                        #{item.incident_id} {item.incident_title}
                      </Link>
                    </Stack>
                  )}
                  secondary={`${item.comment ? `“${item.comment}” · ` : ''}${item.reporter_name}, ${formatAge(item.updated_at)}`}
                />
              </ListItem>
            ))}
          </List>
        </Stack>
      )}
    </Section>
  );
}

Feedback.propTypes = {
  feedback: PropTypes.shape({
    average: PropTypes.number,
    ratings: PropTypes.number.isRequired,
    recent: PropTypes.arrayOf(PropTypes.object).isRequired,
  }).isRequired,
};

export default function EngineerDashboardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [days, setDays] = useWindow();
  const dashboard = useApiList(loadEngineerDashboard, `${id}/${days}`);
  const own = String(user.id) === id;
  const engineer = dashboard.status === 'ready' ? dashboard.data.engineer : null;
  // Back to the team the engineer is on (admins land on that team in the picker).
  const teamLink = `/dashboard?${new URLSearchParams({
    ...(hasRole(user, 'admin') && engineer && { team: engineer.team_id }),
    days,
  })}`;

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Stack sx={{ flexGrow: 1 }}>
          <Typography variant="h5" component="h1">
            {own ? 'My dashboard' : `${engineer?.name ?? 'Engineer'}'s dashboard`}
          </Typography>
          {engineer && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{engineer.team_name}</Typography>
              <Chip
                size="small"
                variant="outlined"
                color={engineer.is_available ? 'success' : 'default'}
                label={engineer.is_available ? 'Available' : 'Unavailable'}
              />
            </Stack>
          )}
        </Stack>
        <Button component={RouterLink} to={teamLink} variant="outlined">
          {engineer ? `${engineer.team_name} dashboard` : 'Team dashboard'}
        </Button>
        <WindowPicker days={days} onChange={setDays} />
      </Stack>
      <DashboardGrid>
        <Loaded result={dashboard} label="engineer dashboard">
          {(data) => (
            <>
              <DashboardSummary dashboard={data} />
              {data.feedback && <Feedback feedback={data.feedback} />}
            </>
          )}
        </Loaded>
      </DashboardGrid>
    </Stack>
  );
}
