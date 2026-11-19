import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as facilities from '../../../src/api/facilities';
import { ApiError } from '../../../src/api/client';
import FacilitiesAdminPage from '../../../src/features/facilities/FacilitiesAdminPage';
import { pick } from '../../facilitiesMock';

// vi.mock is hoisted above imports, so the factory loads the helper itself.
vi.mock('../../../src/api/facilities', async () => (await import('../../facilitiesMock')).facilitiesMock());

const BUILDINGS = [
  { id: 1, name: 'HQ Tower', floor_count: 2, incident_count: 5 },
  { id: 2, name: 'Riverside Annex', floor_count: 1, incident_count: 0 },
];

function renderPage(entry = '/admin/facilities') {
  return render(<MemoryRouter initialEntries={[entry]}><FacilitiesAdminPage /></MemoryRouter>);
}

const row = (name) => screen.getByRole('cell', { name }).closest('tr');

describe('facilities admin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    facilities.listBuildings.mockResolvedValue(BUILDINGS);
  });

  it('lists buildings with how much uses each one', async () => {
    renderPage();
    expect(await screen.findByRole('cell', { name: 'HQ Tower' })).toBeInTheDocument();
    expect(within(row('HQ Tower')).getAllByRole('cell').map((c) => c.textContent)).toEqual(
      ['HQ Tower', '2', '5', 'EditDelete'],
    );
  });

  it('adds a building and reloads the list', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Add building' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Name/), '  Dock House ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(facilities.createBuilding).toHaveBeenCalledWith({ name: 'Dock House' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(facilities.listBuildings).toHaveBeenCalledTimes(2);
  });

  it('shows the server message when the name is taken', async () => {
    facilities.updateBuilding.mockRejectedValue(
      new ApiError('A building called HQ Tower already exists', 409, { name: 'Already in use' }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Riverside Annex' }));
    const dialog = screen.getByRole('dialog');
    const name = within(dialog).getByLabelText(/Name/);
    expect(name).toHaveValue('Riverside Annex');
    await userEvent.clear(name);
    await userEvent.type(name, 'HQ Tower');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('A building called HQ Tower already exists')).toBeInTheDocument();
    expect(within(dialog).getByText('Already in use')).toBeInTheDocument();
    expect(facilities.updateBuilding).toHaveBeenCalledWith(2, { name: 'HQ Tower' });
  });

  it('explains why something in use cannot be deleted', async () => {
    facilities.deleteBuilding.mockRejectedValue(new ApiError("Used by 5 incidents, so it can't be deleted", 409));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete HQ Tower' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText("Used by 5 incidents, so it can't be deleted")).toBeInTheDocument();
    expect(facilities.listBuildings).toHaveBeenCalledTimes(1);
  });

  it('offers Retry when the list fails to load', async () => {
    facilities.listBuildings.mockRejectedValueOnce(new ApiError('Could not reach the server.', 0));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('cell', { name: 'HQ Tower' })).toBeInTheDocument();
  });

  it('adds a floor to the chosen building', async () => {
    facilities.listFloors.mockResolvedValue([{ id: 1, name: 'Ground', seat_count: 2, incident_count: 1 }]);
    renderPage('/admin/facilities?tab=floors');
    expect(screen.getByText('Choose a building to see its floors.')).toBeInTheDocument();
    await pick(/Building/, 'HQ Tower');
    expect(await screen.findByRole('cell', { name: 'Ground' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add floor' }));
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/Name/), 'Floor 2');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(facilities.createFloor).toHaveBeenCalledWith('1', { name: 'Floor 2' });
  });

  it('lists the seats of the floor chosen in the URL', async () => {
    facilities.listSeats.mockResolvedValue([{ id: 7, code: 'G-07', incident_count: 0 }]);
    renderPage('/admin/facilities?tab=seats&building=1&floor=1');
    expect(await screen.findByRole('cell', { name: 'G-07' })).toBeInTheDocument();
    expect(facilities.listSeats).toHaveBeenCalledWith('1');
  });

  it('moves a category to another team by name', async () => {
    facilities.listCategories.mockResolvedValue([
      { id: 1, name: 'HVAC', type: 'facility', team_id: 1, team_name: 'Facilities', incident_count: 3 },
    ]);
    renderPage('/admin/facilities?tab=categories');
    expect(await screen.findByRole('cell', { name: 'Facilities' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit HVAC' }));
    await pick(/Handled by/, 'Workplace Technology');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));

    expect(facilities.updateCategory).toHaveBeenCalledWith(1, { name: 'HVAC', type: 'facility', team_id: 2 });
  });
});
