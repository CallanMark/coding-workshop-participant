import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fetchMe, register } from '../../../src/api/auth';
import { ApiError } from '../../../src/api/client';
import { loadSession, saveSession } from '../../../src/api/session';
import AuthProvider from '../../../src/context/AuthProvider';
import LoginPage from '../../../src/features/auth/LoginPage';
import RegisterPage from '../../../src/features/auth/RegisterPage';

vi.mock('../../../src/api/auth', () => ({ login: vi.fn(), register: vi.fn(), fetchMe: vi.fn() }));

const NEW_EMPLOYEE = {
  id: 30, name: 'Nia New', email: 'nia@acme.inc', role: 'employee', team_id: null,
};

/** Render the register page inside the real auth provider, with stand-in destination pages. */
function renderRegister(entry = '/register') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/incidents/mine" element={<p>My incidents page</p>} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillIn({
  name = 'Nia New', email = 'nia@acme.inc', password = 'Password123!', confirm = password,
} = {}) {
  if (name) await userEvent.type(screen.getByLabelText(/full name/i), name);
  if (email) await userEvent.type(screen.getByLabelText(/work email/i), email);
  if (password) await userEvent.type(screen.getByLabelText(/^password/i), password);
  if (confirm) await userEvent.type(screen.getByLabelText(/confirm password/i), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('RegisterPage', () => {
  beforeEach(() => {
    localStorage.clear();
    register.mockReset();
    fetchMe.mockReset().mockResolvedValue(NEW_EMPLOYEE);
  });

  it('creates the account, signs the employee in and takes them to their incidents', async () => {
    register.mockResolvedValue({ token: 'new-token', user: NEW_EMPLOYEE });
    renderRegister();
    await fillIn({ name: '  Nia New ', email: ' nia@acme.inc ' });

    expect(await screen.findByText('My incidents page')).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith({ name: 'Nia New', email: 'nia@acme.inc', password: 'Password123!' });
    expect(loadSession()).toEqual({ token: 'new-token', user: NEW_EMPLOYEE });
  });

  it('checks every field before calling the server', async () => {
    renderRegister();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText('Use your @acme.inc email address')).toBeInTheDocument();
    expect(screen.getByText('Use 8 to 128 characters')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('only accepts @acme.inc addresses and matching passwords', async () => {
    renderRegister();
    await fillIn({ email: 'nia@gmail.com', confirm: 'Password123?' });

    expect(screen.getByText('Use your @acme.inc email address')).toBeInTheDocument();
    expect(screen.getByText('The passwords don’t match')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('shows the server’s reason under the field, e.g. an email already in use', async () => {
    register.mockRejectedValue(new ApiError('Conflict', 409, { email: 'An account with this email already exists' }));
    renderRegister();
    await fillIn();

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(loadSession()).toBeNull();
  });

  it('shows other failures at the top of the form', async () => {
    register.mockRejectedValue(new ApiError('Could not reach the server', 0));
    renderRegister();
    await fillIn();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('links to and from the sign-in page', async () => {
    renderRegister('/login');
    await userEvent.click(screen.getByRole('link', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends someone already signed in to their home page', () => {
    saveSession({ token: 'old-token', user: NEW_EMPLOYEE });
    renderRegister();
    expect(screen.getByText('My incidents page')).toBeInTheDocument();
  });
});
