import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ActivePlanSyncProvider } from './contexts/ActivePlanSyncContext';
import { ArchivePage } from './pages/ArchivePage';
import { HomePage } from './pages/HomePage';
import { InboxPage } from './pages/InboxPage';
import { KanbanPage } from './pages/KanbanPage';
import { PlanPage } from './pages/PlanPage';
import { ResetPage } from './pages/ResetPage';
import { hasResetParam } from './utils/resetStorage';

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
      <Route path="/board" element={<KanbanPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      {/* PlanPage handles both normal plans (/plan/:id) and snapshots (/?d=...) */}
      <Route path="/plan/:id" element={<PlanPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Base path from Vite config for GitHub Pages deployment
const basename = import.meta.env.BASE_URL;

function AppWithLayout() {
  // Check for reset param before any providers initialize
  // This prevents sync attempts that would re-populate storage
  // ONLY available in development mode for safety
  if (import.meta.env.DEV && hasResetParam()) {
    return <ResetPage />;
  }

  return (
    <ActivePlanSyncProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </ActivePlanSyncProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <AppWithLayout />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
