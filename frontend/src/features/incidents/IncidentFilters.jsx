import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { PRIORITIES, STATUSES } from '../../constants';
import { BuildingSelect, CategorySelect } from '../facilities/FacilityFields';

/** Wait this long after the last keystroke before searching (ms). */
export const SEARCH_DELAY = 400;

/**
 * Search box and filters for the incidents list. Selects apply at once; the search applies once typing stops.
 * @param {{filters: object, showMine: boolean, onChange: function(string, string): void,
 *   onClear: function(): void}} props
 *   filters: from readFilters; showMine: offer "Assigned to me" (people who can be assigned).
 */
export default function IncidentFilters({ filters, showMine, onChange, onClear }) {
  const [search, setSearch] = useState(filters.q);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const typeSearch = (event) => {
    const { value } = event.target;
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange('q', value), SEARCH_DELAY);
  };

  const clear = () => {
    clearTimeout(timer.current);
    setSearch('');
    onClear();
  };

  const select = (name, label, options) => (
    <TextField
      select
      size="small"
      label={label}
      value={filters[name]}
      onChange={(event) => onChange(name, event.target.value)}
      sx={{ minWidth: 150 }}
    >
      {options.map(([value, text]) => <MenuItem key={value} value={value}>{text}</MenuItem>)}
    </TextField>
  );

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, mb: 2 }}
      component="form"
      role="search"
      aria-label="Filter incidents"
      onSubmit={(event) => event.preventDefault()}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap', rowGap: 1.5 }}>
        <TextField
          size="small"
          type="search"
          label="Search title or description"
          value={search}
          onChange={typeSearch}
          sx={{ flexGrow: 1, minWidth: 220 }}
        />
        {select('status', 'Status', [['', 'Any status'], ...Object.entries(STATUSES).map(([v, { label }]) => [v, label])])}
        {select('priority', 'Priority', [['', 'Any priority'], ...Object.entries(PRIORITIES).map(([v, { label }]) => [v, label])])}
        <CategorySelect
          size="small"
          value={filters.category}
          onChange={(id) => onChange('category', id)}
          emptyLabel="Any category"
          showTeam={false}
        />
        <BuildingSelect
          size="small"
          value={filters.building}
          onChange={(id) => onChange('building', id)}
          emptyLabel="Any building"
        />
        {select('assignee', 'Assignee', [
          ['', 'Anyone'], ['none', 'Unassigned'], ...(showMine ? [['me', 'Assigned to me']] : []),
        ])}
        <FormControlLabel
          label="Escalated only"
          control={(
            <Switch
              checked={filters.escalated === 'true'}
              onChange={(event) => onChange('escalated', event.target.checked ? 'true' : '')}
            />
          )}
        />
        <Button onClick={clear}>Clear</Button>
      </Stack>
    </Paper>
  );
}

IncidentFilters.propTypes = {
  filters: PropTypes.shape({
    status: PropTypes.string, priority: PropTypes.string, category: PropTypes.string,
    building: PropTypes.string, assignee: PropTypes.string,
    escalated: PropTypes.string, q: PropTypes.string,
  }).isRequired,
  showMine: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};
