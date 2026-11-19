import { screen, within } from '@testing-library/react';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as analytics from '../../../src/api/analytics';
import { ApiError } from '../../../src/api/client';
import { FEEDBACK, TINA_DASHBOARD } from './dashboardData';
import {
  ADMIN, MORGAN, TINA, renderDashboard,
} from './renderDashboard';

vi.mock('../../../src/api/analytics', () => ({
  getTeamDashboard: vi.fn(), getEngineerDashboard: vi.fn(), getLocationHotspots: vi.fn(),
}));

describe('engineer dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows engineers their own work without any feedback section', async () => {
    analytics.getEngineerDashboard.mockResolvedValue(TINA_DASHBOARD); // the server leaves feedback out for self
    renderDashboard(TINA, '/dashboard/engineers/5');
    expect(await screen.findByRole('heading', { name: 'My dashboard' })).toBeInTheDocument();
    expect(analytics.getEngineerDashboard).toHaveBeenCalledWith('5', '30');
    expect(screen.getByText('Workplace Technology')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'At a glance' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Reporter feedback' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workplace Technology dashboard' })).toHaveAttribute('href', '/dashboard?days=30');
  });

  it("shows a manager the engineer's feedback", async () => {
    analytics.getEngineerDashboard.mockResolvedValue({ ...TINA_DASHBOARD, feedback: FEEDBACK });
    renderDashboard(MORGAN, '/dashboard/engineers/5?days=90');
    expect(await screen.findByRole('heading', { name: "Tina Tech's dashboard" })).toBeInTheDocument();
    expect(analytics.getEngineerDashboard).toHaveBeenCalledWith('5', '90');

    const feedback = screen.getByRole('region', { name: 'Reporter feedback' });
    expect(feedback).toHaveTextContent('3.5 average from 2 ratings');
    expect(within(feedback).getByRole('link', { name: '#7 Projector dead' })).toHaveAttribute('href', '/incidents/7');
    expect(feedback).toHaveTextContent('“Slow to hear back” · Eve Employee');
  });

  it("sends admins back to the engineer's team", async () => {
    analytics.getEngineerDashboard.mockResolvedValue({ ...TINA_DASHBOARD, feedback: { ...FEEDBACK, ratings: 0 } });
    renderDashboard(ADMIN, '/dashboard/engineers/5');
    expect(await screen.findByText('No feedback yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Workplace Technology dashboard' })).toHaveAttribute('href', '/dashboard?team=2&days=30');
  });

  it("shows the server's refusal", async () => {
    analytics.getEngineerDashboard.mockRejectedValue(
      new ApiError('You can only see your own dashboard, or those of engineers on the team you manage', 403),
    );
    renderDashboard(TINA, '/dashboard/engineers/4');
    expect(await screen.findByText(/You can only see your own dashboard/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Engineer's dashboard" })).toBeInTheDocument();
  });
});
