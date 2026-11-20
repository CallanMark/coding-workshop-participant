import PropTypes from 'prop-types';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

/**
 * Pick a team from an already-loaded list. With `allLabel`, an extra first option (value '') means every team.
 * @param {{teams: Array<{id: number, name: string}>, value: string, onChange: function(string): void,
 *   allLabel?: string}} props - value is the team id as a string ('' for all).
 */
export default function TeamSelect({ teams, value, onChange, allLabel }) {
  return (
    <TextField
      select
      size="small"
      label="Team"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{ minWidth: 220 }}
      slotProps={allLabel ? { select: { displayEmpty: true }, inputLabel: { shrink: true } } : undefined}
    >
      {allLabel && <MenuItem value="">{allLabel}</MenuItem>}
      {teams.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>)}
    </TextField>
  );
}

TeamSelect.propTypes = {
  teams: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string })).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  allLabel: PropTypes.string,
};
