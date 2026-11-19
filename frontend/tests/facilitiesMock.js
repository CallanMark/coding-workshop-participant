/**
 * Shared fake facilities data for tests that render the category and location dropdowns.
 * Use with: vi.mock('<path>/src/api/facilities', () => facilitiesMock()) and await pick(...) to choose.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, vi } from 'vitest';

export const BUILDINGS = [{ id: 1, name: 'HQ Tower' }, { id: 2, name: 'Riverside Annex' }];
export const FLOORS = { 1: [{ id: 1, name: 'Ground' }, { id: 2, name: 'Floor 1' }], 2: [{ id: 3, name: 'Ground' }] };
export const SEATS = { 1: [{ id: 1, code: 'G-01' }, { id: 2, code: 'G-02' }], 2: [], 3: [] };
export const CATEGORIES = [
  { id: 1, name: 'HVAC', team_id: 1, team_name: 'Facilities' },
  { id: 4, name: 'IT Hardware', team_id: 2, team_name: 'Workplace Technology' },
];

/** The api/facilities module: lists answered from the data above, writes resolve. */
export function facilitiesMock() {
  return {
    listBuildings: vi.fn(async () => BUILDINGS),
    listFloors: vi.fn(async (buildingId) => FLOORS[buildingId] || []),
    listSeats: vi.fn(async (floorId) => SEATS[floorId] || []),
    listCategories: vi.fn(async () => CATEGORIES),
    listTeams: vi.fn(async () => [{ id: 1, name: 'Facilities' }, { id: 2, name: 'Workplace Technology' }]),
    ...Object.fromEntries(['Building', 'Floor', 'Seat', 'Category'].flatMap((noun) => [
      [`create${noun}`, vi.fn(async () => ({}))],
      [`update${noun}`, vi.fn(async () => ({}))],
      [`delete${noun}`, vi.fn(async () => null)],
    ])),
  };
}

/**
 * Choose an option in a select once it has loaded.
 * @param {string|RegExp} label - the select's label, e.g. /Building/.
 * @param {string|RegExp} option - the option's visible name.
 */
export async function pick(label, option) {
  const select = await screen.findByRole('combobox', { name: label });
  await vi.waitFor(() => expect(select).not.toHaveAttribute('aria-disabled', 'true'));
  await userEvent.click(select);
  await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: option }));
}
