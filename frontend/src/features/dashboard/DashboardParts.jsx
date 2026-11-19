/**
 * Building blocks shared by the dashboards: a titled section, stat cards, the loading and error states, and the 7 / 30 / 90 day picker.
 */
import PropTypes from 'prop-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { WINDOWS } from './useWindow';

/** 7 / 30 / 90 day toggle. */
export function WindowPicker({ days, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={days}
      onChange={(_, value) => value && onChange(value)}
      aria-label="Time window"
    >
      {WINDOWS.map((value) => <ToggleButton key={value} value={value}>{value} days</ToggleButton>)}
    </ToggleButtonGroup>
  );
}

WindowPicker.propTypes = { days: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired };

/** Two columns on wide screens, one on phones. */
export function DashboardGrid({ children }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
      {children}
    </Box>
  );
}

DashboardGrid.propTypes = { children: PropTypes.node };

/** A titled card; `wide` spans both grid columns. Labelled by its title for screen readers and tests. */
export function Section({
  title, subtitle, wide, children,
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={id}
      sx={{ p: 2, gridColumn: wide ? '1 / -1' : undefined, minWidth: 0 }}
    >
      <Typography id={id} variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      <Box sx={{ mt: 1.5 }}>{children}</Box>
    </Paper>
  );
}

Section.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  wide: PropTypes.bool,
  children: PropTypes.node,
};

/** One headline number with a label. `tone` colours the number (e.g. "error.main"). */
export function StatCard({ label, value, tone }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: '1 1 140px' }}>
      <Typography variant="h4" component="p" sx={{ color: tone, fontWeight: 600 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Paper>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  tone: PropTypes.string,
};

/** A row of stat cards that wraps on narrow screens. */
export function StatRow({ children }) {
  return <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>{children}</Stack>;
}

StatRow.propTypes = { children: PropTypes.node };

/**
 * Loading spinner, error with retry, or `children(data)` once loaded.
 * @param {{result: {status: string, data: *, error: string, retry: function}, label: string,
 *   children: function(*): import('react').ReactNode}} props
 */
export function Loaded({ result, label, children }) {
  if (result.status === 'error') {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={result.retry}>Retry</Button>}>
        {result.error}
      </Alert>
    );
  }
  if (result.status !== 'ready') {
    return <Stack sx={{ alignItems: 'center', py: 4 }}><CircularProgress aria-label={`Loading ${label}`} /></Stack>;
  }
  return children(result.data);
}

Loaded.propTypes = {
  result: PropTypes.shape({
    status: PropTypes.string.isRequired,
    data: PropTypes.any,
    error: PropTypes.string,
    retry: PropTypes.func.isRequired,
  }).isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.func.isRequired,
};
