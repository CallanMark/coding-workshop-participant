import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { ApiError } from '../../../src/api/client';
import * as api from '../../../src/api/incidents';
import { AuthContext } from '../../../src/context/auth';
import IncidentDetailPage from '../../../src/features/incidents/IncidentDetailPage';

vi.mock('../../../src/api/incidents', async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = Object.fromEntries(Object.keys(actual).map((name) => [name, vi.fn()]));
  return { ...mocked, locationQuery: actual.locationQuery };
});

const EVE = { id: 2, name: 'Eve Employee', role: 'employee', team_id: null };
const FRED = { id: 4, name: 'Fred Facilities', role: 'engineer', team_id: 1 };
const PAT = { id: 8, name: 'Pat Manager', role: 'manager', team_id: 1 };
const ADMIN = { id: 1, name: 'Alex Admin', role: 'admin', team_id: null };

const INCIDENT = {
  id: 10, title: 'Air con not working', description: 'Very warm', status: 'in_progress', priority: 'medium',
  team_id: 1, team_name: 'Facilities', category_name: 'HVAC', building_name: 'HQ Tower', floor_name: 'Ground',
  seat_code: null, reporter_id: 2, reporter_name: 'Eve Employee', assignee_id: 4, assignee_name: 'Fred Facilities',
  is_escalated: false, escalation_reason: null, blocked_reason: null, created_at: '2026-11-18T09:00:00Z',
  acknowledged_at: null, resolved_at: null, closed_at: null,
};
const NOTE = { id: 1, incident_id: 10, author_id: 2, author_name: 'Eve Employee', body: 'Still warm', created_at: '2026-11-18T10:00:00Z' };
const EVENT = { id: 1, event_type: 'created', actor_id: 2, actor_name: 'Eve Employee', created_at: '2026-11-18T09:00:00Z' };

function renderAs(user) {
  return render(
    <AuthContext.Provider value={{ user, notice: '', login: vi.fn(), logout: vi.fn() }}>
      <MemoryRouter initialEntries={['/incidents/10']}>
        <Routes>
          <Route path="/incidents/:id" element={<IncidentDetailPage />} />
          <Route path="/incidents" element={<p>Incident list</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const actions = async () => within(await screen.findByRole('group', { name: 'Actions' }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getIncident.mockResolvedValue(INCIDENT);
  api.listNotes.mockResolvedValue([NOTE]);
  api.listEvents.mockResolvedValue([EVENT]);
  api.getFeedback.mockRejectedValue(new ApiError('Not allowed', 403));
});

describe('incident detail page', () => {
  it('shows the incident, its workflow and one timeline of notes and history', async () => {
    renderAs(EVE);
    expect(await screen.findByRole('heading', { name: 'Air con not working' })).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow')).toBeInTheDocument();
    const timeline = within(screen.getByRole('list', { name: 'Timeline' }));
    expect(timeline.getByText(/Eve Employee reported it/)).toBeInTheDocument();
    expect(timeline.getByText('Still warm')).toBeInTheDocument();
    expect(screen.getByText('HQ Tower › Ground')).toBeInTheDocument();
  });

  it('says not found for an incident the user may not see', async () => {
    api.getIncident.mockRejectedValue(new ApiError('Incident not found', 404));
    renderAs(EVE);
    expect(await screen.findByText(/Incident not found/)).toBeInTheDocument();
  });

  it.each([
    [FRED, ['Mark blocked', 'Resolve', 'Escalate'], ['Assign', 'Reassign', 'Edit', 'Delete']],
    [EVE, ['Escalate'], ['Resolve', 'Reassign', 'Edit', 'Delete']],
    [PAT, ['Mark blocked', 'Resolve', 'Reassign', 'Escalate', 'Edit'], ['Delete']],
    [ADMIN, ['Resolve', 'Reassign', 'Edit', 'Delete'], ['Take it']],
  ])('offers %o only their actions', async (user, shown, hidden) => {
    renderAs(user);
    const bar = await actions();
    shown.forEach((name) => expect(bar.getByRole('button', { name })).toBeInTheDocument());
    hidden.forEach((name) => expect(bar.queryByRole('button', { name })).not.toBeInTheDocument());
  });

  it('lets a teammate take an unassigned ticket', async () => {
    api.getIncident.mockResolvedValue({ ...INCIDENT, status: 'open', assignee_id: null, assignee_name: null });
    api.assignIncident.mockResolvedValue({});
    renderAs({ ...FRED, id: 9 });
    await userEvent.click((await actions()).getByRole('button', { name: 'Take it' }));
    expect(api.assignIncident).toHaveBeenCalledWith(10, 9);
    expect(await screen.findByText('You are now assigned')).toBeInTheDocument();
  });

  it('asks for a reason before blocking', async () => {
    api.changeIncidentStatus.mockResolvedValue({});
    renderAs(FRED);
    await userEvent.click((await actions()).getByRole('button', { name: 'Mark blocked' }));
    await userEvent.type(screen.getByLabelText(/Reason/), 'Waiting for parts');
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(api.changeIncidentStatus).toHaveBeenCalledWith(10, { status: 'blocked', reason: 'Waiting for parts' });
  });

  it('adds a note and reloads the timeline', async () => {
    api.addNote.mockResolvedValue({});
    renderAs(FRED);
    await userEvent.type(await screen.findByLabelText('Add a note'), 'On my way');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(api.addNote).toHaveBeenCalledWith(10, 'On my way');
    await waitFor(() => expect(api.listNotes).toHaveBeenCalledTimes(2));
  });

  it('lets only the author edit a note', async () => {
    renderAs(FRED);
    const timeline = within(await screen.findByRole('list', { name: 'Timeline' }));
    expect(timeline.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows the server error in the assign dialog and keeps it open', async () => {
    api.assignIncident.mockRejectedValue(new ApiError('Validation failed', 400, { assignee_id: 'Omar Offline is marked as unavailable' }));
    renderAs(PAT);
    await userEvent.click((await actions()).getByRole('button', { name: 'Reassign' }));
    const field = screen.getByLabelText('Engineer ID');
    await userEvent.clear(field);
    await userEvent.type(field, '6');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await screen.findByText('Omar Offline is marked as unavailable')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirms before an admin deletes, then goes back to the list', async () => {
    api.deleteIncident.mockResolvedValue(null);
    renderAs(ADMIN);
    await userEvent.click((await actions()).getByRole('button', { name: 'Delete' }));
    expect(api.deleteIncident).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(api.deleteIncident).toHaveBeenCalledWith(10);
    expect(await screen.findByText('Incident list')).toBeInTheDocument();
  });

  it('hides closed incidents from new notes', async () => {
    api.getIncident.mockResolvedValue({ ...INCIDENT, status: 'closed' });
    renderAs(EVE);
    expect(await screen.findByText(/no more notes can be added/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a note')).not.toBeInTheDocument();
  });
});

describe('private feedback', () => {
  const resolved = { ...INCIDENT, status: 'resolved' };

  it('is invisible to the engineer: no card at all when the server refuses', async () => {
    api.getIncident.mockResolvedValue(resolved);
    renderAs(FRED);
    await screen.findByRole('heading', { name: 'Air con not working' });
    await waitFor(() => expect(api.getFeedback).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Private feedback' })).not.toBeInTheDocument();
  });

  it('lets the reporter rate the work once resolved', async () => {
    api.getIncident.mockResolvedValue(resolved);
    api.getFeedback.mockResolvedValue(null);
    api.saveFeedback.mockResolvedValue({ rating: 4, comment: 'Quick', engineer_name: 'Fred Facilities' });
    renderAs(EVE);
    const card = within(await screen.findByRole('region', { name: 'Private feedback' }));
    expect(card.getByText(/not Fred Facilities/)).toBeInTheDocument();
    await userEvent.click(card.getByRole('button', { name: 'Give feedback' }));
    fireEvent.click(card.getByLabelText('4 Stars')); // MUI hides the real radio from the pointer
    await userEvent.type(card.getByLabelText('Comment (optional)'), 'Quick');
    await userEvent.click(card.getByRole('button', { name: 'Save feedback' }));
    expect(api.saveFeedback).toHaveBeenCalledWith(10, { rating: 4, comment: 'Quick' });
    expect(await card.findByText('Thanks, your feedback was saved.')).toBeInTheDocument();
  });

  it('shows the manager the rating read-only', async () => {
    api.getIncident.mockResolvedValue(resolved);
    api.getFeedback.mockResolvedValue({ rating: 3, comment: 'Slow to reply', reporter_name: 'Eve Employee', engineer_name: 'Fred Facilities' });
    renderAs(PAT);
    const card = within(await screen.findByRole('region', { name: 'Private feedback' }));
    expect(card.getByText('Slow to reply')).toBeInTheDocument();
    expect(card.getByText('From Eve Employee')).toBeInTheDocument();
    expect(card.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is locked for the reporter once closed', async () => {
    api.getIncident.mockResolvedValue({ ...INCIDENT, status: 'closed' });
    api.getFeedback.mockResolvedValue({ rating: 5, comment: null, engineer_name: 'Fred Facilities' });
    renderAs(EVE);
    const card = within(await screen.findByRole('region', { name: 'Private feedback' }));
    expect(card.getByText(/Locked now that the incident is closed/)).toBeInTheDocument();
    expect(card.queryByRole('button', { name: /feedback/ })).not.toBeInTheDocument();
  });
});
