import PropTypes from 'prop-types';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import {
  createBuilding, createCategory, createFloor, createSeat, deleteBuilding, deleteCategory, deleteFloor, deleteSeat,
  listBuildings, listCategories, listFloors, listSeats, listTeams, updateBuilding, updateCategory, updateFloor,
  updateSeat,
} from '../../api/facilities';
import { BuildingSelect, FloorSelect } from './FacilityFields';
import FacilitySection from './FacilitySection';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';

const TABS = [
  { value: 'buildings', label: 'Buildings' },
  { value: 'floors', label: 'Floors' },
  { value: 'seats', label: 'Seats' },
  { value: 'categories', label: 'Categories' },
];

const CATEGORY_TYPES = [{ value: 'facility', label: 'Facility' }, { value: 'technology', label: 'Technology' }];
const NAME_FIELD = [{ name: 'name', label: 'Name' }];
const byName = (row) => row.name;
const nameForm = (row) => ({ name: row?.name ?? '' });
const trimmedName = (values) => ({ name: values.name.trim() });

function BuildingsTab() {
  const list = useApi(listBuildings, 'all');
  return (
    <FacilitySection
      noun="building"
      list={list}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'floor_count', label: 'Floors', numeric: true },
        { key: 'incident_count', label: 'Incidents', numeric: true },
      ]}
      fields={NAME_FIELD}
      nameOf={byName}
      toForm={nameForm}
      save={(values, row) => (row ? updateBuilding(row.id, trimmedName(values)) : createBuilding(trimmedName(values)))}
      remove={(row) => deleteBuilding(row.id)}
      emptyText="No buildings yet. Add the first one."
    />
  );
}

function FloorsTab({ buildingId }) {
  const list = useApi(listFloors, buildingId || null);
  if (!buildingId) return <Typography color="text.secondary">Choose a building to see its floors.</Typography>;
  return (
    <FacilitySection
      noun="floor"
      list={list}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'seat_count', label: 'Seats', numeric: true },
        { key: 'incident_count', label: 'Incidents', numeric: true },
      ]}
      fields={NAME_FIELD}
      nameOf={byName}
      toForm={nameForm}
      save={(values, row) => (row ? updateFloor(row.id, trimmedName(values)) : createFloor(buildingId, trimmedName(values)))}
      remove={(row) => deleteFloor(row.id)}
      emptyText="This building has no floors yet."
    />
  );
}

FloorsTab.propTypes = { buildingId: PropTypes.string.isRequired };

function SeatsTab({ floorId }) {
  const list = useApi(listSeats, floorId || null);
  if (!floorId) return <Typography color="text.secondary">Choose a building and floor to see its seats.</Typography>;
  return (
    <FacilitySection
      noun="seat"
      list={list}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'incident_count', label: 'Incidents', numeric: true },
      ]}
      fields={[{ name: 'code', label: 'Code' }]}
      nameOf={(row) => row.code}
      toForm={(row) => ({ code: row?.code ?? '' })}
      save={(values, row) => {
        const seat = { code: values.code.trim() };
        return row ? updateSeat(row.id, seat) : createSeat(floorId, seat);
      }}
      remove={(row) => deleteSeat(row.id)}
      emptyText="This floor has no seats yet."
    />
  );
}

SeatsTab.propTypes = { floorId: PropTypes.string.isRequired };

function CategoriesTab() {
  const list = useApi(listCategories, 'all');
  const teams = useApi(listTeams, 'all');
  // The add/edit form needs the teams too, so show the teams' loading or error state if that is what's missing.
  const shown = teams.status === 'ready' ? list : { ...teams, retry: () => { teams.retry(); list.retry(); } };
  return (
    <FacilitySection
      noun="category"
      list={shown}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'team_name', label: 'Handled by' },
        { key: 'incident_count', label: 'Incidents', numeric: true },
      ]}
      fields={[
        { name: 'name', label: 'Name' },
        { name: 'type', label: 'Type', options: CATEGORY_TYPES },
        { name: 'team_id', label: 'Handled by', options: teams.data.map((t) => ({ value: String(t.id), label: t.name })) },
      ]}
      nameOf={byName}
      toForm={(row) => ({ name: row?.name ?? '', type: row?.type ?? '', team_id: row ? String(row.team_id) : '' })}
      save={(values, row) => {
        const category = { name: values.name.trim(), type: values.type, team_id: Number(values.team_id) };
        return row ? updateCategory(row.id, category) : createCategory(category);
      }}
      remove={(row) => deleteCategory(row.id)}
      emptyText="No categories yet."
    />
  );
}

/**
 * Admin: manage buildings, floors, seats and categories (/admin/facilities).
 * The tab and the chosen building and floor live in the URL, so a reload or a shared link keeps them.
 */
export default function FacilitiesAdminPage() {
  const [params, update] = useQueryParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'buildings';
  const buildingId = params.get('building') || '';
  const floorId = params.get('floor') || '';

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">Facilities</Typography>
      <Tabs value={tab} onChange={(_, value) => update({ tab: value })} aria-label="Facilities">
        {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
      </Tabs>
      {(tab === 'floors' || tab === 'seats') && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ maxWidth: 640 }}>
          <BuildingSelect value={buildingId} onChange={(id) => update({ building: id, floor: '' })} size="small" />
          {tab === 'seats' && (
            <FloorSelect buildingId={buildingId} value={floorId} onChange={(id) => update({ floor: id })} size="small" />
          )}
        </Stack>
      )}
      {tab === 'buildings' && <BuildingsTab />}
      {tab === 'floors' && <FloorsTab buildingId={buildingId} />}
      {tab === 'seats' && <SeatsTab floorId={floorId} />}
      {tab === 'categories' && <CategoriesTab />}
    </Stack>
  );
}
