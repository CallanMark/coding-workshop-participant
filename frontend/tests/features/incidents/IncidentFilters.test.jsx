import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { listIncidents } from '../../../src/api/incidents';
import { AuthContext } from '../../../src/context/auth';
import IncidentListPage from '../../../src/features/incidents/IncidentListPage';
import { readFilters, toApiFilters } from '../../../src/features/incidents/incidentFilters';
import { pick } from '../../facilitiesMock';

// vi.mock is hoisted above imports, so the factory loads the helper itself.
vi.mock('../../../src/api/facilities', async () => (await import('../../facilitiesMock')).facilitiesMock());

vi.mock('../../../src/api/incidents', async (importOriginal) => ({
  ...(await importOriginal()),
  listIncidents: vi.fn(),
}));

const FRED = { id: 4, name: 'Fred Facilities', role: 'engineer', team_id: 1 };
const EVE = { id: 2, name: 'Eve Employee', role: 'employee', team_id: null };
const ROW = {
  id: 1, title: 'Air con not working', status: 'open', priority: 'medium', created_at: '2026-11-18T09:00:00Z',
};

/** Shows the current URL query so tests can check what the filters wrote. */
function UrlProbe() {
  return <p data-testid="url">{useLocation().search}</p>;
}

function renderList(user, path = '/incidents') {
  return render(
    <AuthContext.Provider value={{ user, notice: '', login: vi.fn(), logout: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/incidents" element={<><IncidentListPage /><UrlProbe /></>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const url = () => screen.getByTestId('url').textContent;

async function choose(label, option) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}

describe('filter helpers', () => {
  it('reads every filter from the URL, blank when unset', () => {
    expect(readFilters(new URLSearchParams('status=open&q=wifi'))).toEqual({
      status: 'open', priority: '', category: '', building: '', assignee: '', escalated: '', q: 'wifi',
    });
  });

  it('turns "me" and "none" into assignee ids for the API', () => {
    const base = readFilters(new URLSearchParams());
    expect(toApiFilters({ ...base, assignee: 'me' }, FRED)).toEqual({ assignee_id: 4 });
    expect(toApiFilters({ ...base, assignee: 'none' }, FRED)).toEqual({ assignee_id: 'none' });
    expect(toApiFilters({ ...base, escalated: 'true', q: '  leak ' }, FRED)).toEqual({ escalated: 'true', q: 'leak' });
  });
});

describe('incidents list filters', () => {
  beforeEach(() => {
    listIncidents.mockReset().mockResolvedValue([ROW]);
  });

  it('applies filters already in the URL (a refresh or shared link keeps them)', async () => {
    renderList(FRED, '/incidents?status=blocked&assignee=me');
    await screen.findByText('Air con not working');
    expect(listIncidents).toHaveBeenCalledWith({ status: 'blocked', assignee_id: '4' });
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Blocked');
  });

  it('a select reloads the list and writes the URL', async () => {
    renderList(FRED);
    await screen.findByText('Air con not working');
    await choose('Priority', 'Critical');
    await waitFor(() => expect(listIncidents).toHaveBeenLastCalledWith({ priority: 'critical' }));
    expect(url()).toBe('?priority=critical');
  });

  it('searches once typing stops', async () => {
    renderList(FRED);
    await screen.findByText('Air con not working');
    await userEvent.type(screen.getByRole('searchbox', { name: /Search/ }), 'wifi');
    await waitFor(() => expect(listIncidents).toHaveBeenLastCalledWith({ q: 'wifi' }));
    expect(listIncidents).toHaveBeenCalledTimes(2); // the first load, then one search, not one per letter
    expect(url()).toBe('?q=wifi');
  });

  it('filters by category and building by name, sending their ids', async () => {
    renderList(FRED);
    await screen.findByText('Air con not working');
    await pick(/Category/, /IT Hardware/);
    await pick(/Building/, 'Riverside Annex');
    await waitFor(() => expect(listIncidents).toHaveBeenLastCalledWith({ category_id: '4', building_id: '2' }));
    expect(url()).toBe('?category=4&building=2');
  });

  it('escalated only is a switch', async () => {
    renderList(FRED);
    await screen.findByText('Air con not working');
    await userEvent.click(screen.getByRole('switch', { name: 'Escalated only' }));
    await waitFor(() => expect(listIncidents).toHaveBeenLastCalledWith({ escalated: 'true' }));
  });

  it('says when nothing matches and clears every filter', async () => {
    listIncidents.mockResolvedValue([]);
    renderList(FRED, '/incidents?status=closed&q=zzz');
    expect(await screen.findByText('No incidents match these filters.')).toBeInTheDocument();
    listIncidents.mockResolvedValue([ROW]);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Air con not working')).toBeInTheDocument();
    expect(url()).toBe('');
    expect(screen.getByRole('searchbox', { name: /Search/ })).toHaveValue('zzz'); // box keeps text until Clear in the bar
  });

  it('only offers "Assigned to me" to people who can be assigned', async () => {
    renderList(EVE);
    await screen.findByText('Air con not working');
    await userEvent.click(screen.getByRole('combobox', { name: 'Assignee' }));
    expect(screen.queryByRole('option', { name: 'Assigned to me' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument();
  });

  it('shows how many incidents match', async () => {
    listIncidents.mockResolvedValue([ROW, { ...ROW, id: 2 }]);
    renderList(FRED, '/incidents?status=open');
    expect(await screen.findByRole('status')).toHaveTextContent('2 incidents match');
  });
});
