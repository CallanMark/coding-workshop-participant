import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as analytics from '../../../src/api/analytics';
import { ApiError } from '../../../src/api/client';
import { listTeams } from '../../../src/api/facilities';
import { listEngineers } from '../../../src/api/incidents';
import { HOTSPOTS, TEAM } from './dashboardData';
import {
  ADMIN, MORGAN, TINA, renderDashboard,
} from './renderDashboard';

vi.mock('../../../src/api/analytics', () => ({
  getTeamDashboard: vi.fn(), getEngineerDashboard: vi.fn(), getLocationHotspots: vi.fn(),
}));
vi.mock('../../../src/api/facilities', () => ({ listTeams: vi.fn() }));
vi.mock('../../../src/api/incidents', () => ({ listEngineers: vi.fn() }));

const ENGINEERS = [
  {
    id: 6, name: 'Omar Offline', is_available: false, open_incidents: 0,
  },
  {
    id: 5, name: 'Tina Tech', is_available: true, open_incidents: 2,
  },
];

const section = (name) => screen.getByRole('region', { name });

describe('team dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analytics.getTeamDashboard.mockResolvedValue(TEAM);
    analytics.getLocationHotspots.mockResolvedValue(HOTSPOTS);
    listTeams.mockResolvedValue([{ id: 1, name: 'Facilities' }, { id: 2, name: 'Workplace Technology' }]);
    listEngineers.mockResolvedValue(ENGINEERS);
  });

  it("shows an engineer their own team's numbers over 30 days", async () => {
    renderDashboard(TINA);
    expect(await screen.findByRole('heading', { name: 'Workplace Technology dashboard' })).toBeInTheDocument();
    expect(analytics.getTeamDashboard).toHaveBeenCalledWith('2', '30');

    const glance = section('At a glance');
    expect(within(glance).getByText('Open now').previousSibling).toHaveTextContent('4');
    expect(within(glance).getByText('Blocked').previousSibling).toHaveTextContent('1');
    expect(within(glance).getByText('Reported, 30 days').previousSibling).toHaveTextContent('4');

    // donuts list every part with its count and share
    const status = section('Open by status');
    expect(within(status).getByLabelText('Not started: 2')).toHaveTextContent('50%');
    expect(within(status).getByLabelText('Blocked: 1')).toHaveTextContent('25%');
    expect(within(section('Open by priority')).getByLabelText('Medium: 3')).toHaveTextContent('75%');
    expect(within(section('Open by priority')).getByLabelText('Critical: 0')).toBeInTheDocument();
  });

  it('shows response times as medians, with a dash when there is nothing to measure', async () => {
    renderDashboard(TINA);
    const speed = await screen.findByRole('region', { name: 'Response times' });
    expect(within(speed).getByText('To acknowledge').previousSibling).toHaveTextContent('1h');
    expect(within(speed).getByText('To assign').previousSibling).toHaveTextContent('1h 30m');
    expect(within(speed).getByText('To resolve').previousSibling).toHaveTextContent('—');
    expect(speed).toHaveTextContent('over the last 30 days');
  });

  it('folds reports outside the top categories into Other', async () => {
    renderDashboard(TINA);
    const issues = await screen.findByRole('region', { name: 'Most common issues' });
    expect(within(issues).getByLabelText('Network (technology): 2')).toHaveTextContent('50%');
    expect(within(issues).getByLabelText('Other: 2')).toBeInTheDocument(); // 4 reported, 2 in a listed category
  });

  it('links the oldest open incidents to their pages', async () => {
    renderDashboard(TINA);
    const waiting = await screen.findByRole('region', { name: 'Waiting longest' });
    expect(within(waiting).getByRole('link', { name: '#3 Wi-Fi drops' })).toHaveAttribute('href', '/incidents/3');
    expect(within(waiting).getByText('Escalated')).toBeInTheDocument();
  });

  it('gives engineers a link to their own dashboard but no workload or locations', async () => {
    renderDashboard(TINA);
    await screen.findByRole('region', { name: 'At a glance' });
    expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute('href', '/dashboard/engineers/5?days=30');
    expect(screen.queryByRole('region', { name: 'Team workload' })).not.toBeInTheDocument();
    expect(screen.queryByText('Location hotspots')).not.toBeInTheDocument();
    expect(listEngineers).not.toHaveBeenCalled();
  });

  it("shows a manager their team's workload, linking each engineer's dashboard", async () => {
    renderDashboard(MORGAN);
    const table = await screen.findByRole('table', { name: 'Team workload' });
    expect(listEngineers).toHaveBeenCalledWith('2');
    const tina = within(table).getByRole('link', { name: 'Tina Tech' });
    expect(tina).toHaveAttribute('href', '/dashboard/engineers/5');
    expect(within(tina.closest('tr')).getByText('Available')).toBeInTheDocument();
    expect(within(tina.closest('tr')).getAllByRole('cell').slice(2).map((c) => c.textContent)).toEqual(['2', '100%']);
    expect(screen.queryByRole('link', { name: 'My dashboard' })).not.toBeInTheDocument();
    expect(analytics.getLocationHotspots).not.toHaveBeenCalled();
  });

  it('changes the window and keeps it for the next load', async () => {
    renderDashboard(MORGAN);
    await screen.findByRole('region', { name: 'At a glance' });
    await userEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(analytics.getTeamDashboard).toHaveBeenLastCalledWith('2', '90');
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads the window from the URL', async () => {
    renderDashboard(MORGAN, '/dashboard?days=7');
    await screen.findByRole('region', { name: 'At a glance' });
    expect(analytics.getTeamDashboard).toHaveBeenCalledWith('2', '7');
  });

  it('lets admins pick any team, starting with the first, and see location hotspots', async () => {
    renderDashboard(ADMIN);
    await screen.findByRole('region', { name: 'At a glance' });
    expect(analytics.getTeamDashboard).toHaveBeenCalledWith('1', '30');
    expect(listEngineers).toHaveBeenCalledWith('1');

    const buildings = await screen.findByRole('table', { name: 'Buildings hotspots' });
    expect(within(buildings).getByRole('row', { name: 'HQ Tower 2 5' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Floors hotspots' })).toHaveTextContent('HQ Tower · Ground');
    expect(within(section('Seats')).getByText(/No incidents with a seat/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Team' }));
    await userEvent.click(screen.getByRole('option', { name: 'Workplace Technology' }));
    expect(analytics.getTeamDashboard).toHaveBeenLastCalledWith('2', '30');
  });

  it('shows the server message with a retry when loading fails', async () => {
    analytics.getTeamDashboard.mockRejectedValueOnce(new ApiError("You can only see your own team's dashboard", 403));
    renderDashboard(TINA);
    expect(await screen.findByText("You can only see your own team's dashboard")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'At a glance' })).toBeInTheDocument();
  });

  it('explains when there is nothing to show', async () => {
    analytics.getTeamDashboard.mockResolvedValue({
      ...TEAM,
      open: {
        total: 0,
        escalated: 0,
        by_status: { open: 0, in_progress: 0, blocked: 0 },
        by_priority: {
          low: 0, medium: 0, high: 0, critical: 0,
        },
      },
      oldest_open: [],
      categories: [],
      speed: { reported: 0, resolved: 0, median_seconds: { acknowledge: null, assign: null, resolve: null } },
    });
    renderDashboard(TINA);
    expect(await screen.findByText('Nothing open. Nice work.')).toBeInTheDocument();
    expect(screen.getByText('No incidents reported in this window.')).toBeInTheDocument();
    expect(within(section('Open by status')).getByText('Nothing open.')).toBeInTheDocument();
  });
});
