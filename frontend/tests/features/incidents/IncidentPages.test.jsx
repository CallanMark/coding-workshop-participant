import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createIncident, listIncidents } from '../../../src/api/incidents';
import { AuthContext } from '../../../src/context/auth';
import IncidentCreatePage from '../../../src/features/incidents/IncidentCreatePage';
import IncidentListPage from '../../../src/features/incidents/IncidentListPage';
import MyIncidentsPage from '../../../src/features/incidents/MyIncidentsPage';

vi.mock('../../../src/api/incidents', async (importOriginal) => ({
  ...(await importOriginal()), // keeps pure helpers such as locationQuery
  listIncidents: vi.fn(), createIncident: vi.fn(), changeIncidentStatus: vi.fn(), findDuplicates: vi.fn(),
}));

const USERS = {
  admin: { id: 1, name: 'Alex Admin', role: 'admin', team_id: null },
  manager: { id: 7, name: 'Morgan Manager', role: 'manager', team_id: 2 },
  engineer: { id: 4, name: 'Fred Facilities', role: 'engineer', team_id: 1 },
  employee: { id: 2, name: 'Eve Employee', role: 'employee', team_id: null },
};

/** Render a page as a signed-in user (auth state provided directly; no API). */
function renderAs(user, page, path = '/') {
  return render(
    <AuthContext.Provider value={{ user, notice: '', login: vi.fn(), logout: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={page} />
          <Route path="/incidents" element={<p>Incidents list</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('incident pages use the signed-in user', () => {
  beforeEach(() => {
    listIncidents.mockReset().mockResolvedValue([]);
    createIncident.mockReset();
  });

  it('the board asks for only my incidents', async () => {
    renderAs(USERS.engineer, <MyIncidentsPage />);
    expect(await screen.findByText(/hasn't reported and isn't assigned/i)).toBeInTheDocument();
    expect(listIncidents).toHaveBeenCalledWith({ mine: true });
  });

  it.each([
    ['admin', 'All incidents'],
    ['manager', 'Team incidents'],
    ['engineer', 'Team incidents'],
    ['employee', 'My reported incidents'],
  ])('the list title says what a %s sees', async (role, title) => {
    renderAs(USERS[role], <IncidentListPage />);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(listIncidents).toHaveBeenCalledWith();
  });

  it('the report form never asks who the reporter is', async () => {
    createIncident.mockResolvedValue({ id: 9, title: 'Leak' });
    renderAs(USERS.employee, <IncidentCreatePage />, '/incidents/new');

    expect(screen.queryByLabelText(/reporter/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/title/i), 'Leak');
    await userEvent.type(screen.getByLabelText(/category id/i), '1');
    await userEvent.type(screen.getByLabelText(/building id/i), '1');
    await userEvent.click(screen.getByRole('button', { name: /report incident/i }));

    expect(await screen.findByText('Incidents list')).toBeInTheDocument();
    expect(createIncident).toHaveBeenCalledWith({
      title: 'Leak', priority: 'medium', category_id: 1, building_id: 1,
    });
  });
});
