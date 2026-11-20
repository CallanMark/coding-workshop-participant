import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { ApiError } from '../../../src/api/client';
import { findDuplicates } from '../../../src/api/incidents';
import DuplicateSuggestions from '../../../src/features/incidents/DuplicateSuggestions';
import { pick } from '../../facilitiesMock';

// vi.mock is hoisted above imports, so the factory loads the helper itself.
vi.mock('../../../src/api/facilities', async () => (await import('../../facilitiesMock')).facilitiesMock());

vi.mock('../../../src/api/incidents', async (importOriginal) => ({
  ...(await importOriginal()),
  findDuplicates: vi.fn(),
}));

// All the server sends about a possible duplicate: the reporter may not be allowed to see it.
const MATCH = {
  title: 'Air con not working', category_name: 'HVAC', building_name: 'HQ Tower', floor_name: 'Ground', seat_code: 'G-01',
};

function renderPanel(props) {
  return render(
    <MemoryRouter>
      <DuplicateSuggestions categoryId="" buildingId="" floorId="" {...props} />
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

  it('shows each match as its title, category and place, with no link to open it', async () => {
    renderPanel({ categoryId: '1', buildingId: '1', floorId: '1' });
    expect(await screen.findByText('Air con not working')).toBeInTheDocument();
    expect(screen.getByText('HVAC · HQ Tower › Ground › G-01')).toBeInTheDocument();
    expect(findDuplicates).toHaveBeenCalledWith({ category_id: '1', building_id: '1', floor_id: '1' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('leaves out the floor and seat when the match has none', async () => {
    findDuplicates.mockResolvedValue([{ ...MATCH, floor_name: null, seat_code: null }]);
    renderPanel({ categoryId: '1', buildingId: '1' });
    expect(await screen.findByText('HVAC · HQ Tower')).toBeInTheDocument();
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
