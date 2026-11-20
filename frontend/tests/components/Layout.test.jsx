import {
  render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Layout from '../../src/components/Layout';
import { AuthContext } from '../../src/context/auth';

const ADMIN = { id: 1, name: 'Alex Admin', role: 'admin', team_id: null };
const EVE = { id: 2, name: 'Eve Employee', role: 'employee', team_id: null };

function renderLayout(user, logout = vi.fn()) {
  return render(
    <AuthContext.Provider value={{ user, notice: '', logout }}>
      <MemoryRouter initialEntries={['/incidents']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/incidents" element={<p>Incidents page</p>} />
            <Route path="/admin/facilities" element={<p>Facilities page</p>} />
          </Route>
          <Route path="/login" element={<p>Sign-in page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('Layout', () => {
  it('shows only the links the role may use', () => {
    renderLayout(EVE);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'My incidents' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Facilities' })).not.toBeInTheDocument();
  });

  it('has a phone menu with the same links, which closes after choosing one', async () => {
    renderLayout(ADMIN);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('region', { name: 'Menu' });
    expect(within(menu).getByText('Alex Admin')).toBeInTheDocument();

    await userEvent.click(within(menu).getByRole('link', { name: 'Facilities' }));
    expect(screen.getByText('Facilities page')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Menu' })).not.toBeInTheDocument());
  });

  it('signs out from the phone menu', async () => {
    const logout = vi.fn();
    renderLayout(ADMIN, logout);
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = screen.getByRole('region', { name: 'Menu' });
    await userEvent.click(within(menu).getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalled();
    expect(screen.getByText('Sign-in page')).toBeInTheDocument();
  });
});
