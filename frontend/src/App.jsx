import { Route, Routes } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import LoginPage from './features/auth/LoginPage';
import IncidentCreatePage from './features/incidents/IncidentCreatePage';
import IncidentDetailPage from './features/incidents/IncidentDetailPage';
import IncidentListPage from './features/incidents/IncidentListPage';
import IncidentSummaryPage from './features/incidents/IncidentSummaryPage';
import MyIncidentsPage from './features/incidents/MyIncidentsPage';

/**
 * App routes. / and /login are the sign-in page; everything else needs a signed-in user.
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
          <Route path="incidents/:id/summary" element={<IncidentSummaryPage />} />
          <Route path="*" element={<Typography>Page not found.</Typography>} />
        </Route>
      </Route>
    </Routes>
  );
}
