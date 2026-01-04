import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ActivePlanSyncProvider } from './contexts/ActivePlanSyncContext';
import { HomePage } from './pages/HomePage';
import { PlanPage } from './pages/PlanPage';
import { SnapshotPage } from './pages/SnapshotPage';

function AppRoutes() {
  const [searchParams] = useSearchParams();
  const hasSnapshot = searchParams.has('d');

  // If we have ?d= param, show snapshot regardless of path
  if (hasSnapshot) {
    return <SnapshotPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/plan/:id" element={<PlanPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Base path from Vite config for GitHub Pages deployment
const basename = import.meta.env.BASE_URL;

export function App() {
  return (
    <BrowserRouter basename={basename}>
      <ActivePlanSyncProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </ActivePlanSyncProvider>
    </BrowserRouter>
  );
}
