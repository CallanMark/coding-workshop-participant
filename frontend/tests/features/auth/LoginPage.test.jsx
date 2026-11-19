import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fetchMe, login } from '../../../src/api/auth';
import { ApiError } from '../../../src/api/client';
import { loadSession, saveSession } from '../../../src/api/session';
import AuthProvider from '../../../src/context/AuthProvider';
import LoginPage from '../../../src/features/auth/LoginPage';

vi.mock('../../../src/api/auth', () => ({ login: vi.fn(), fetchMe: vi.fn() }));

const EVE = {
  id: 2, name: 'Eve Employee', email: 'eve@acme.inc', role: 'employee', team_id: null,
};

/** Render the login page inside the real auth provider, with stand-in destination pages. */
function renderLogin(entry = '/login') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/incidents/mine" element={<p>My incidents page</p>} />
          <Route path="/incidents" element={<p>All incidents page</p>} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    login.mockReset();
    fetchMe.mockReset().mockResolvedValue(EVE);
  });

  it.each(['/', '/login'])('is shown at %s', (path) => {
    renderLogin(path);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('asks for blank fields without calling the API', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the server message and clears the password when sign-in fails', async () => {
    login.mockRejectedValue(new ApiError('Email or password is incorrect', 401));
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'eve@acme.inc');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
    expect(loadSession()).toBeNull();
  });

  it('signs in, remembers the session and goes to My incidents', async () => {
    login.mockResolvedValue({ token: 'jwt', user: EVE });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), ' eve@acme.inc ');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('My incidents page')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('eve@acme.inc', 'Password123!');
    expect(loadSession()).toEqual({ token: 'jwt', user: EVE });
  });

  it('takes engineers, managers and admins to the team dashboard', async () => {
    const fred = {
      id: 4, name: 'Fred Facilities', email: 'fred@acme.inc', role: 'engineer', team_id: 1,
    };
    login.mockResolvedValue({ token: 'jwt', user: fred });
    renderLogin();

    await userEvent.type(screen.getByLabelText(/email/i), 'fred@acme.inc');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
  });

  it('returns to the page the user was trying to open', async () => {
    login.mockResolvedValue({ token: 'jwt', user: EVE });
    renderLogin({ pathname: '/login', state: { from: { pathname: '/incidents', search: '' } } });

    await userEvent.type(screen.getByLabelText(/email/i), 'eve@acme.inc');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('All incidents page')).toBeInTheDocument();
  });

  it("ignores a page left by someone else that the new user's role can't open", async () => {
    login.mockResolvedValue({ token: 'jwt', user: EVE });
    renderLogin({ pathname: '/login', state: { from: { pathname: '/dashboard', search: '?days=7' } } });

    await userEvent.type(screen.getByLabelText(/email/i), 'eve@acme.inc');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('My incidents page')).toBeInTheDocument();
  });

  it('sends an already signed-in user straight on', async () => {
    saveSession({ token: 'jwt', user: EVE });
    renderLogin('/');
    expect(await screen.findByText('My incidents page')).toBeInTheDocument();
  });
});
