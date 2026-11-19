import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { ApiError } from '../../../src/api/client';
import { findDuplicates, getIncident, getIncidentSummary } from '../../../src/api/incidents';
import DuplicateSuggestions from '../../../src/features/incidents/DuplicateSuggestions';
import IncidentSummaryPage from '../../../src/features/incidents/IncidentSummaryPage';
import { pick } from '../../facilitiesMock';

// vi.mock is hoisted above imports, so the factory loads the helper itself.
vi.mock('../../../src/api/facilities', async () => (await import('../../facilitiesMock')).facilitiesMock());

vi.mock('../../../src/api/incidents', async (importOriginal) => ({
  ...(await importOriginal()),
  findDuplicates: vi.fn(), getIncident: vi.fn(), getIncidentSummary: vi.fn(),
}));

const MATCH = {
  id: 1, title: 'Air con not working', status: 'open', priority: 'medium', created_at: '2026-11-18T09:00:00Z',
  category_name: 'HVAC', building_name: 'HQ Tower', floor_name: 'Ground',
};

function renderPanel(props) {
  return render(
    <MemoryRouter>
      <DuplicateSuggestions categoryId="" buildingId="" floorId="" {...props} />
    </MemoryRouter>,
  );
}

function renderSummary(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/incidents/:id/summary" element={<IncidentSummaryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('possible duplicates on the report form', () => {
  beforeEach(() => {
    findDuplicates.mockReset().mockResolvedValue([MATCH]);
  });

  it('does not check until category and building are valid ids', async () => {
    renderPanel({ categoryId: '1', buildingId: '' });
    renderPanel({ categoryId: '1', buildingId: 'abc' });
    renderPanel({ categoryId: '1', buildingId: '1', floorId: '0' });
    await new Promise((resolve) => { setTimeout(resolve, 500); });
    expect(findDuplicates).not.toHaveBeenCalled();
  });

  it('lists matches as links to their summary, keeping the place in the link', async () => {
    renderPanel({ categoryId: '1', buildingId: '1', floorId: '1' });
    const link = await screen.findByRole('link', { name: /#1 Air con not working/ });
    expect(findDuplicates).toHaveBeenCalledWith({ category_id: '1', building_id: '1', floor_id: '1' });
    expect(link).toHaveAttribute('href', '/incidents/1/summary?category_id=1&building_id=1&floor_id=1');
    expect(link).toHaveAttribute('target', '_blank'); // keep the draft report open
  });

  it('checks once after typing stops, not on every keystroke', async () => {
    const { rerender } = renderPanel({ categoryId: '1', buildingId: '1' });
    rerender(<MemoryRouter><DuplicateSuggestions categoryId="1" buildingId="12" floorId="" /></MemoryRouter>);
    rerender(<MemoryRouter><DuplicateSuggestions categoryId="1" buildingId="1" floorId="" /></MemoryRouter>);
    await screen.findByRole('region', { name: 'Possible duplicates' });
    expect(findDuplicates).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when there are no matches or the check fails', async () => {
    findDuplicates.mockResolvedValueOnce([]).mockRejectedValueOnce(new ApiError('Down', 500));
    renderPanel({ categoryId: '1', buildingId: '1' });
    renderPanel({ categoryId: '2', buildingId: '1' });
    await waitFor(() => expect(findDuplicates).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'Possible duplicates' })).not.toBeInTheDocument();
  });

  it('appears on the report form once category and building are chosen', async () => {
    const { default: IncidentCreatePage } = await import('../../../src/features/incidents/IncidentCreatePage');
    render(<MemoryRouter><IncidentCreatePage /></MemoryRouter>);
    await pick(/Category/, /HVAC/);
    await pick(/Building/, 'HQ Tower');
    await pick(/Floor/, 'Ground');
    expect(await screen.findByText('Possible duplicates')).toBeInTheDocument();
    expect(findDuplicates).toHaveBeenLastCalledWith({ category_id: '1', building_id: '1', floor_id: '1' });
  });
});

describe('possible duplicate summary page', () => {
  beforeEach(() => {
    getIncidentSummary.mockReset().mockResolvedValue(MATCH);
    getIncident.mockReset().mockRejectedValue(new ApiError('Incident not found', 404));
  });

  it('shows the limited summary for the place in the URL', async () => {
    renderSummary('/incidents/1/summary?category_id=1&building_id=1&floor_id=1');
    expect(await screen.findByRole('heading', { name: 'Air con not working' })).toBeInTheDocument();
    expect(screen.getByText(/HQ Tower, Ground/)).toBeInTheDocument();
    expect(getIncidentSummary).toHaveBeenCalledWith('1', { category_id: '1', building_id: '1', floor_id: '1' });
  });

  it('offers the full incident only when the server lets the user see it', async () => {
    renderSummary('/incidents/1/summary?category_id=1&building_id=1');
    await screen.findByRole('heading', { name: 'Air con not working' });
    expect(screen.queryByRole('link', { name: 'Open full incident' })).not.toBeInTheDocument();
  });

  it('links to the full incident for someone who may see it', async () => {
    getIncident.mockResolvedValue({ ...MATCH, description: 'Warm' });
    renderSummary('/incidents/1/summary?category_id=1&building_id=1');
    expect(await screen.findByRole('link', { name: 'Open full incident' })).toHaveAttribute('href', '/incidents/1');
  });

  it('says so when the incident no longer matches', async () => {
    getIncidentSummary.mockRejectedValue(new ApiError('Incident not found', 404));
    renderSummary('/incidents/1/summary?category_id=2&building_id=1');
    expect(await screen.findByText(/no longer open at that place/)).toBeInTheDocument();
  });

  it('offers a retry on other errors', async () => {
    getIncidentSummary.mockRejectedValueOnce(new ApiError('Could not reach the server', 0));
    renderSummary('/incidents/1/summary?category_id=1&building_id=1');
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Air con not working' })).toBeInTheDocument();
  });
});
