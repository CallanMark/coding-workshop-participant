import { Navigate, Route, Routes } from 'react-router-dom';
import Typography from '@mui/material/Typography';
import Layout from './components/Layout';
import IncidentCreatePage from './features/incidents/IncidentCreatePage';
import IncidentListPage from './features/incidents/IncidentListPage';
import MyIncidentsPage from './features/incidents/MyIncidentsPage';

/**
 * App routes.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/incidents/mine" replace />} />
        <Route path="incidents" element={<IncidentListPage />} />
        <Route path="incidents/mine" element={<MyIncidentsPage />} />
        <Route path="incidents/new" element={<IncidentCreatePage />} />
        <Route path="*" element={<Typography>Page not found.</Typography>} />
      </Route>
    </Routes>
  );
}
