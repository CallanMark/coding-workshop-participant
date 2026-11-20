/**
 * Admin: engineer profiles (/admin/engineers). Every engineer, deactivated ones too, with their team,
 * availability and open work; add, edit (name, team), mark available or not, deactivate and reactivate.
 * The team filter lives in the URL (?team=), so a reload or shared link keeps it.
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { createEngineer, listEngineerProfiles, updateEngineer } from '../../api/engineers';
import { listTeams } from '../../api/facilities';
import Loaded from '../../components/Loaded';
import TeamSelect from '../../components/TeamSelect';
import { ActiveChip } from '../../components/PersonChips';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { EngineerFormDialog, EngineerStatusDialog } from './EngineerDialogs';

const ALL_TEAMS = '';

function EngineersTable({ engineers, onEdit, onStatus, onAvailability }) {
  if (engineers.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 2 }}>No engineers yet. Add the first one.</Typography>;
  }
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Engineers">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Team</TableCell>
            <TableCell>Available</TableCell>
            <TableCell align="right">Open incidents</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {engineers.map((engineer) => (
            <TableRow key={engineer.id} hover sx={{ opacity: engineer.is_active ? 1 : 0.6 }}>
              <TableCell>
                {engineer.is_active
                  ? <Link component={RouterLink} to={`/dashboard/engineers/${engineer.id}`}>{engineer.name}</Link>
                  : engineer.name}
              </TableCell>
              <TableCell>{engineer.email}</TableCell>
              <TableCell>{engineer.team_name}</TableCell>
              <TableCell>
                <Switch
                  size="small"
                  checked={engineer.is_available}
                  disabled={!engineer.is_active}
                  onChange={(event) => onAvailability(engineer, event.target.checked)}
                  slotProps={{ input: { 'aria-label': `${engineer.name} available` } }}
                />
              </TableCell>
              <TableCell align="right">{engineer.open_incidents}</TableCell>
              <TableCell>
                <ActiveChip active={engineer.is_active} />
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Button size="small" onClick={() => onEdit(engineer)} aria-label={`Edit ${engineer.name}`}>Edit</Button>
                <Button
                  size="small"
                  color={engineer.is_active ? 'error' : 'primary'}
                  onClick={() => onStatus(engineer)}
                  aria-label={`${engineer.is_active ? 'Deactivate' : 'Reactivate'} ${engineer.name}`}
                >
                  {engineer.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

EngineersTable.propTypes = {
  engineers: PropTypes.arrayOf(PropTypes.object).isRequired,
  onEdit: PropTypes.func.isRequired,
  onStatus: PropTypes.func.isRequired,
  onAvailability: PropTypes.func.isRequired,
};

function Engineers({ teams }) {
  const [params, update] = useQueryParams();
  const teamId = teams.some((t) => String(t.id) === params.get('team')) ? params.get('team') : ALL_TEAMS;
  const engineers = useApi(listEngineerProfiles, teamId);
  const [dialog, setDialog] = useState(null); // { mode: 'add' | 'edit' | 'status', engineer }
  const [error, setError] = useState('');

  const close = () => setDialog(null);
  const saved = () => {
    setDialog(null);
    engineers.retry();
  };
  const setAvailability = async (engineer, available) => {
    setError('');
    try {
      await updateEngineer(engineer.id, { is_available: available });
      engineers.retry();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>Engineers</Typography>
        <TeamSelect teams={teams} value={teamId} onChange={(team) => update({ team })} allLabel="All teams" />
        <Button variant="contained" onClick={() => setDialog({ mode: 'add' })} disabled={engineers.status !== 'ready'}>
          Add engineer
        </Button>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Loaded result={engineers} label="engineers">
        {(rows) => (
          <EngineersTable
            engineers={rows}
            onEdit={(engineer) => setDialog({ mode: 'edit', engineer })}
            onStatus={(engineer) => setDialog({ mode: 'status', engineer })}
            onAvailability={setAvailability}
          />
        )}
      </Loaded>
      {dialog && dialog.mode !== 'status' && (
        <EngineerFormDialog
          engineer={dialog.engineer}
          teams={teams}
          teamId={teamId ? Number(teamId) : undefined}
          onCancel={close}
          onSave={(body) => (dialog.engineer ? updateEngineer(dialog.engineer.id, body) : createEngineer(body))
            .then(saved)}
        />
      )}
      {dialog?.mode === 'status' && (
        <EngineerStatusDialog
          engineer={dialog.engineer}
          onCancel={close}
          onConfirm={() => updateEngineer(dialog.engineer.id, { is_active: !dialog.engineer.is_active }).then(saved)}
        />
      )}
    </Stack>
  );
}

Engineers.propTypes = { teams: PropTypes.arrayOf(PropTypes.object).isRequired };

export default function EngineersAdminPage() {
  const teams = useApi(listTeams, 'all');
  return (
    <Loaded result={teams} label="teams">
      {(rows) => <Engineers teams={rows} />}
    </Loaded>
  );
}
