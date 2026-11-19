import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { ApiError } from '../../../src/api/client';
import { createEngineer, listEngineerProfiles, updateEngineer } from '../../../src/api/engineers';
import { listTeams } from '../../../src/api/facilities';
import EngineersAdminPage from '../../../src/features/engineers/EngineersAdminPage';

vi.mock('../../../src/api/facilities', () => ({ listTeams: vi.fn() }));
vi.mock('../../../src/api/engineers', () => ({
  listEngineerProfiles: vi.fn(), createEngineer: vi.fn(), updateEngineer: vi.fn(),
}));

const engineer = (id, name, teamId, fields = {}) => ({
  id, name, email: `${name.split(' ')[0].toLowerCase()}@acme.inc`, team_id: teamId,
  team_name: teamId === 1 ? 'Facilities' : 'Workplace Technology',
  is_available: true, is_active: true, open_incidents: 0, ...fields,
});
const ENGINEERS = [
  engineer(4, 'Fred Facilities', 1),
  engineer(6, 'Omar Offline', 2, { is_available: false, is_active: false }),
  engineer(5, 'Tina Tech', 2, { open_incidents: 11 }),
];

function renderPage(entry = '/admin/engineers') {
  return render(<MemoryRouter initialEntries={[entry]}><EngineersAdminPage /></MemoryRouter>);
}

/** The table row whose first cell starts with the engineer's name. */
const row = (name) => screen.getAllByRole('row').find((r) => r.cells[0].textContent.startsWith(name));

describe('engineers admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTeams.mockResolvedValue([{ id: 1, name: 'Facilities' }, { id: 2, name: 'Workplace Technology' }]);
    listEngineerProfiles.mockResolvedValue(ENGINEERS);
    createEngineer.mockResolvedValue({});
    updateEngineer.mockResolvedValue({});
  });

  it('lists every engineer with team, workload and status', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Engineers' });
    expect(listEngineerProfiles).toHaveBeenCalledWith('');
    expect(within(row('Tina Tech')).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['Tina Tech', 'tina@acme.inc', 'Workplace Technology', '', '11', 'Active', 'EditDeactivate'],
    );
    expect(within(row('Tina Tech')).getByRole('link', { name: 'Tina Tech' })).toHaveAttribute(
      'href', '/dashboard/engineers/5',
    );
    // deactivated: no dashboard link, can't be marked available, can be reactivated
    expect(within(row('Omar Offline')).getByText('Deactivated')).toBeInTheDocument();
    expect(within(row('Omar Offline')).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Omar Offline available' })).toBeDisabled();
  });

  it('filters by team from the URL and the picker', async () => {
    renderPage('/admin/engineers?team=2');
    await screen.findByRole('table', { name: 'Engineers' });
    expect(listEngineerProfiles).toHaveBeenCalledWith('2');
    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }));
    await userEvent.click(screen.getByRole('option', { name: 'All teams' }));
    expect(listEngineerProfiles).toHaveBeenLastCalledWith('');
  });

  it('adds an engineer to a team with a temporary password', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Add engineer' }));
    const dialog = screen.getByRole('dialog');
    const add = within(dialog).getByRole('button', { name: 'Add' });

    await userEvent.type(within(dialog).getByLabelText(/Name/), ' Nia New ');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'nia.new@acme.inc');
    await userEvent.type(within(dialog).getByLabelText(/Temporary password/), 'short');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Team/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Facilities' }));
    expect(add).toBeDisabled(); // password under 8 characters
    await userEvent.type(within(dialog).getByLabelText(/Temporary password/), 'er123!');
    await userEvent.click(add);

    expect(createEngineer).toHaveBeenCalledWith({
      name: 'Nia New', email: 'nia.new@acme.inc', password: 'shorter123!', team_id: 1,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(listEngineerProfiles).toHaveBeenCalledTimes(2);
  });

  it('starts a new engineer on the team being viewed', async () => {
    renderPage('/admin/engineers?team=2');
    await userEvent.click(await screen.findByRole('button', { name: 'Add engineer' }));
    expect(within(screen.getByRole('dialog')).getByRole('combobox', { name: /Team/ })).toHaveTextContent(
      'Workplace Technology',
    );
  });

  it('shows the server’s field errors when adding fails', async () => {
    createEngineer.mockRejectedValue(new ApiError('An account with this email already exists', 409, {
      email: 'An account with this email already exists',
    }));
    renderPage('/admin/engineers?team=2');
    await userEvent.click(await screen.findByRole('button', { name: 'Add engineer' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Name/), 'Tina Again');
    await userEvent.type(within(dialog).getByLabelText(/Email/), 'tina@acme.inc');
    await userEvent.type(within(dialog).getByLabelText(/Temporary password/), 'Password123!');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('An account with this email already exists');
    expect(within(dialog).getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends only what changed when editing', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Fred Facilities' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Team/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Workplace Technology' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(updateEngineer).toHaveBeenCalledWith(4, { team_id: 2 });
  });

  it('marks an engineer unavailable', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('switch', { name: 'Tina Tech available' }));
    expect(updateEngineer).toHaveBeenCalledWith(5, { is_available: false });
  });

  it('explains when someone still has open work and cannot be deactivated', async () => {
    updateEngineer.mockRejectedValue(new ApiError('Reassign their 11 open incidents first', 409));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Tina Tech' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(updateEngineer).toHaveBeenCalledWith(5, { is_active: false });
    expect(await screen.findByText('Reassign their 11 open incidents first')).toBeInTheDocument();
  });

  it('reactivates a deactivated engineer', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivate Omar Offline' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reactivate' }));
    expect(updateEngineer).toHaveBeenCalledWith(6, { is_active: true });
  });
});
