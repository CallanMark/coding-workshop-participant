import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { AREA_ROLES } from './context/auth';
import LoginPage from './features/auth/LoginPage';
import EngineersAdminPage from './features/engineers/EngineersAdminPage';
import FacilitiesAdminPage from './features/facilities/FacilitiesAdminPage';
import IncidentCreatePage from './features/incidents/IncidentCreatePage';
import IncidentDetailPage from './features/incidents/IncidentDetailPage';
import IncidentListPage from './features/incidents/IncidentListPage';
import MyIncidentsPage from './features/incidents/MyIncidentsPage';

// The dashboards carry the charts library, so they load only when first opened.
const TeamDashboardPage = lazy(() => import('./features/dashboard/TeamDashboardPage'));
const EngineerDashboardPage = lazy(() => import('./features/dashboard/EngineerDashboardPage'));
const loading = <LinearProgress aria-label="Loading page" />;

/**
 * App routes. / and /login are the sign-in page; everything else needs a signed-in user,
 * /dashboard needs staff (engineer, manager or admin) and /admin/* needs an admin.
 */
export default function App() {
  return (
    <Routes>
      <Route index element={<LoginPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="incidents" element={<IncidentListPage />} />
          <Route path="incidents/mine" element={<MyIncidentsPage />} />
          <Route path="incidents/new" element={<IncidentCreatePage />} />
          <Route path="incidents/:id" element={<IncidentDetailPage />} />
          <Route element={<RequireAuth roles={AREA_ROLES['/dashboard']} />}>
            <Route path="dashboard" element={<Suspense fallback={loading}><TeamDashboardPage /></Suspense>} />
            <Route
              path="dashboard/engineers/:id"
              element={<Suspense fallback={loading}><EngineerDashboardPage /></Suspense>}
            />
          </Route>
          <Route element={<RequireAuth roles={AREA_ROLES['/admin']} />}>
            <Route path="admin/facilities" element={<FacilitiesAdminPage />} />
            <Route path="admin/engineers" element={<EngineersAdminPage />} />
          </Route>
          <Route path="*" element={<Typography>Page not found.</Typography>} />
        </Route>
      </Route>
    </Routes>
  );
}
