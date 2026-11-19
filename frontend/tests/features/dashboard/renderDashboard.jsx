/**
 * Render a dashboard route as a given user, with the real routes for /dashboard and engineer dashboards.
 */
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext } from '../../../src/context/auth';
import EngineerDashboardPage from '../../../src/features/dashboard/EngineerDashboardPage';
import TeamDashboardPage from '../../../src/features/dashboard/TeamDashboardPage';

export const ADMIN = { id: 1, name: 'Alex Admin', role: 'admin', team_id: null };
export const TINA = { id: 5, name: 'Tina Tech', role: 'engineer', team_id: 2 };
export const MORGAN = { id: 7, name: 'Morgan Manager', role: 'manager', team_id: 2 };

export function renderDashboard(user, entry = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthContext.Provider value={{ user }}>
        <Routes>
          <Route path="/dashboard" element={<TeamDashboardPage />} />
          <Route path="/dashboard/engineers/:id" element={<EngineerDashboardPage />} />
          <Route path="/incidents/:id" element={<p>Incident page</p>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
