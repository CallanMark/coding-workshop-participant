import PropTypes from 'prop-types';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { listBuildings, listCategories, listFloors, listSeats } from '../../api/facilities';
import useApiList from './useApiList';

/**
 * A select that loads its options: "Loading…" while fetching, the error with Retry if it fails.
 * Values are ids as strings ('' = none); users only ever see names.
 */
function LoadingSelect({
  label, value, onChange, list, options, required = false, disabled = false, error = '', emptyLabel = null,
  helperText = '', size = 'medium',
}) {
  let helper = error || helperText;
  if (list.status === 'loading') helper = 'Loading…';
  if (list.status === 'error') helper = `Could not load: ${list.error}`;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flex: 1, minWidth: 160 }}>
      <TextField
        select
        fullWidth
        size={size}
        label={label}
        required={required}
        value={list.status === 'ready' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || list.status !== 'ready'}
        error={Boolean(error) || list.status === 'error'}
        helperText={helper}
      >
        {emptyLabel !== null && <MenuItem value=""><em>{emptyLabel}</em></MenuItem>}
        {options}
      </TextField>
      {list.status === 'error' && <Button onClick={list.retry} sx={{ mt: 1 }}>Retry</Button>}
    </Stack>
  );
}

LoadingSelect.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  list: PropTypes.shape({ status: PropTypes.string, error: PropTypes.string, retry: PropTypes.func }).isRequired,
  options: PropTypes.node,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  error: PropTypes.string,
  emptyLabel: PropTypes.string,
  helperText: PropTypes.string,
  size: PropTypes.string,
};

/**
 * Category dropdown; each option says which team handles it.
 * @param {{value: string, onChange: function(string, object|undefined): void, required?: boolean,
 *   error?: string, emptyLabel?: string|null, size?: string, showTeam?: boolean}} props
 *   onChange gets the id ('' for none) and the chosen category; showTeam: say who handles the chosen one.
 */
export function CategorySelect({
  value, onChange, required = false, error = '', emptyLabel = null, size = 'medium', showTeam = true,
}) {
  const categories = useApiList(listCategories, 'all');
  const chosen = categories.data.find((category) => String(category.id) === value);
  return (
    <LoadingSelect
      label="Category"
      value={value}
      onChange={(id) => onChange(id, categories.data.find((category) => String(category.id) === id))}
      list={categories}
      required={required}
      error={error}
      emptyLabel={emptyLabel}
      size={size}
      helperText={chosen && showTeam ? `Handled by ${chosen.team_name}` : ''}
      options={categories.data.map((category) => (
        <MenuItem key={category.id} value={String(category.id)}>
          <ListItemText primary={category.name} secondary={category.team_name} sx={{ my: 0 }} />
        </MenuItem>
      ))}
    />
  );
}

CategorySelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  error: PropTypes.string,
  emptyLabel: PropTypes.string,
  size: PropTypes.string,
  showTeam: PropTypes.bool,
};

/**
 * Building dropdown on its own (e.g. a list filter).
 * @param {{value: string, onChange: function(string): void, emptyLabel?: string|null, size?: string}} props
 */
export function BuildingSelect({ value, onChange, emptyLabel = null, size = 'medium', required = false, error = '' }) {
  const buildings = useApiList(listBuildings, 'all');
  return (
    <LoadingSelect
      label="Building"
      value={value}
      onChange={onChange}
      list={buildings}
      required={required}
      error={error}
      emptyLabel={emptyLabel}
      size={size}
      options={buildings.data.map((b) => <MenuItem key={b.id} value={String(b.id)}>{b.name}</MenuItem>)}
    />
  );
}

BuildingSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  emptyLabel: PropTypes.string,
  size: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
};

// What a dependent select shows before its parent is chosen.
const NOT_CHOSEN = { status: 'ready', data: [], error: '', retry: () => {} };

/**
 * Floors of one building; disabled until a building is chosen.
 * @param {{buildingId: string, value: string, onChange: function(string): void, emptyLabel?: string|null,
 *   size?: string, required?: boolean, error?: string}} props
 */
export function FloorSelect({ buildingId, value, onChange, emptyLabel = null, size = 'medium', required = false, error = '' }) {
  const floors = useApiList(listFloors, buildingId || null);
  return (
    <LoadingSelect
      label="Floor"
      value={value}
      onChange={onChange}
      list={buildingId ? floors : NOT_CHOSEN}
      disabled={!buildingId}
      required={required}
      error={error}
      emptyLabel={emptyLabel}
      size={size}
      options={floors.data.map((f) => <MenuItem key={f.id} value={String(f.id)}>{f.name}</MenuItem>)}
    />
  );
}

FloorSelect.propTypes = {
  buildingId: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  emptyLabel: PropTypes.string,
  size: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
};

/**
 * Building → Floor → Seat. Choosing a building loads its floors; choosing a floor loads its seats;
 * changing a level clears the levels below it. Floor and seat are optional.
 * @param {{value: {building_id: string, floor_id: string, seat_id: string},
 *   onChange: function({building_id: string, floor_id: string, seat_id: string}): void,
 *   errors?: object}} props
 */
export function LocationFields({ value, onChange, errors = {} }) {
  const seats = useApiList(listSeats, value.floor_id || null);
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <BuildingSelect
        value={value.building_id}
        onChange={(id) => onChange({ building_id: id, floor_id: '', seat_id: '' })}
        required
        error={errors.building_id}
      />
      <FloorSelect
        buildingId={value.building_id}
        value={value.floor_id}
        onChange={(id) => onChange({ ...value, floor_id: id, seat_id: '' })}
        error={errors.floor_id}
        emptyLabel="No particular floor"
      />
      <LoadingSelect
        label="Seat"
        value={value.seat_id}
        onChange={(id) => onChange({ ...value, seat_id: id })}
        list={value.floor_id ? seats : NOT_CHOSEN}
        disabled={!value.floor_id}
        error={errors.seat_id}
        emptyLabel="No particular seat"
        options={seats.data.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.code}</MenuItem>)}
      />
    </Stack>
  );
}

LocationFields.propTypes = {
  value: PropTypes.shape({
    building_id: PropTypes.string.isRequired,
    floor_id: PropTypes.string.isRequired,
    seat_id: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  errors: PropTypes.object,
};
