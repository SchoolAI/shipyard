import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ActivePlanSyncProvider } from './contexts/ActivePlanSyncContext';
import { ArchivePage } from './pages/ArchivePage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { PlanPage } from './pages/PlanPage';

function AppRoutes() {
  const [searchParams] = useSearchParams();
  const hasSnapshot = searchParams.has('d');

  // If we have ?d= param (snapshot mode), show PlanPage regardless of path
  if (hasSnapshot) {
    return <PlanPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      {/* PlanPage handles both normal plans (/plan/:id) and snapshots (/?d=...) */}
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
