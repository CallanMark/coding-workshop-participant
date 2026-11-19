import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import * as facilities from '../../../src/api/facilities';
import { ApiError } from '../../../src/api/client';
import { CategorySelect, LocationFields } from '../../../src/features/facilities/FacilityFields';
import { pick } from '../../facilitiesMock';

// vi.mock is hoisted above imports, so the factory loads the helper itself.
vi.mock('../../../src/api/facilities', async () => (await import('../../facilitiesMock')).facilitiesMock());

/** LocationFields with its own state, reporting each change. */
function Location({ onChange = () => {} }) {
  const [value, setValue] = useState({ building_id: '', floor_id: '', seat_id: '' });
  return (
    <>
      <LocationFields value={value} onChange={(next) => { setValue(next); onChange(next); }} />
      <p data-testid="value">{JSON.stringify(value)}</p>
    </>
  );
}

const value = () => JSON.parse(screen.getByTestId('value').textContent);

describe('location dropdowns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows names, never ids, and cascades building → floor → seat', async () => {
    render(<Location />);
    expect(screen.getByRole('combobox', { name: /Floor/ })).toHaveAttribute('aria-disabled', 'true');
    await pick(/Building/, 'HQ Tower');
    expect(facilities.listFloors).toHaveBeenCalledWith('1');
    await pick(/Floor/, 'Floor 1');
    await pick(/Seat/, /No particular seat/);
    expect(value()).toEqual({ building_id: '1', floor_id: '2', seat_id: '' });
    expect(screen.queryByText(/ID/)).not.toBeInTheDocument();
  });

  it('changing the building clears floor and seat', async () => {
    render(<Location />);
    await pick(/Building/, 'HQ Tower');
    await pick(/Floor/, 'Ground');
    await pick(/Seat/, 'G-01');
    expect(value()).toEqual({ building_id: '1', floor_id: '1', seat_id: '1' });
    await pick(/Building/, 'Riverside Annex');
    expect(value()).toEqual({ building_id: '2', floor_id: '', seat_id: '' });
    expect(screen.getByRole('combobox', { name: /Seat/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('offers Retry when a list fails to load', async () => {
    facilities.listBuildings.mockRejectedValueOnce(new ApiError('Could not reach the server', 0));
    render(<Location />);
    expect(await screen.findByText(/Could not load: Could not reach the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await pick(/Building/, 'HQ Tower');
    expect(value().building_id).toBe('1');
  });
});

describe('category dropdown', () => {
  it('says which team handles the chosen category', async () => {
    const onChange = vi.fn();
    function Category() {
      const [id, setId] = useState('');
      return <CategorySelect value={id} onChange={(next, category) => { setId(next); onChange(next, category); }} />;
    }
    render(<Category />);
    await pick(/Category/, /IT Hardware/);
    expect(onChange).toHaveBeenCalledWith('4', expect.objectContaining({ team_name: 'Workplace Technology' }));
    await waitFor(() => expect(screen.getByText('Handled by Workplace Technology')).toBeInTheDocument());
  });
});
