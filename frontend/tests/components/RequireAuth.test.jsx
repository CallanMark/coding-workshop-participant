import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { loadSession, saveSession } from '../../src/api/session';
import AuthProvider from '../../src/context/AuthProvider';
import LoginPage from '../../src/features/auth/LoginPage';
import Layout from '../../src/components/Layout';
import RequireAuth from '../../src/components/RequireAuth';

const EVE = {
  id: 2, name: 'Eve Employee', email: 'eve@acme.inc', role: 'employee', team_id: null,
};
const ADMIN = {
  id: 1, name: 'Alex Admin', email: 'admin@acme.inc', role: 'admin', team_id: null,
};

/** A fetch stub that answers /auth/me with the given status and body. */
function stubMe(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status === 200, status, json: async () => body,
  }));
}

/** The app's route structure, with simple stand-ins for the incidents pages. */
function renderApp(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/incidents" element={<p>All incidents page</p>} />
              <Route element={<RequireAuth roles={['admin']} />}>
                <Route path="/admin" element={<p>Admin page</p>} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => stubMe(200, EVE));

  it('sends signed-out users to sign in', () => {
    renderApp('/incidents');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the page and the user when signed in', async () => {
    saveSession({ token: 'jwt', user: EVE });
    renderApp('/incidents');
    expect(screen.getByText('All incidents page')).toBeInTheDocument();
    expect(screen.getByText('Eve Employee')).toBeInTheDocument();
  });

  it('blocks a page the role is not allowed to see', () => {
    saveSession({ token: 'jwt', user: EVE });
    renderApp('/admin');
    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(screen.queryByText('Admin page')).not.toBeInTheDocument();
  });

  it('allows a page for a permitted role', () => {
    stubMe(200, ADMIN);
    saveSession({ token: 'jwt', user: ADMIN });
    renderApp('/admin');
    expect(screen.getByText('Admin page')).toBeInTheDocument();
  });

  it('shows the Facilities link only to admins', () => {
    saveSession({ token: 'jwt', user: EVE });
    const { unmount } = renderApp('/incidents');
    expect(screen.queryByRole('link', { name: 'Facilities' })).not.toBeInTheDocument();
    unmount();

    stubMe(200, ADMIN);
    saveSession({ token: 'jwt', user: ADMIN });
    renderApp('/incidents');
    expect(screen.getByRole('link', { name: 'Facilities' })).toHaveAttribute('href', '/admin/facilities');
  });

  it('shows dashboard links to staff only, and My dashboard to engineers', () => {
    saveSession({ token: 'jwt', user: EVE });
    const { unmount } = renderApp('/incidents');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    unmount();

    const tina = {
      id: 5, name: 'Tina Tech', email: 'tina@acme.inc', role: 'engineer', team_id: 2,
    };
    stubMe(200, tina);
    saveSession({ token: 'jwt', user: tina });
    renderApp('/incidents');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute('href', '/dashboard/engineers/5');
  });

  it('signs out with a message when the stored session has expired', async () => {
    stubMe(401, { error: { message: 'Your session has expired. Please sign in again.' } });
    saveSession({ token: 'expired', user: EVE });
    renderApp('/incidents');

    expect(await screen.findByText('Your session has expired. Please sign in again.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });

  it('signs out from the top bar', async () => {
    saveSession({ token: 'jwt', user: EVE });
    renderApp('/incidents');

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });
});
