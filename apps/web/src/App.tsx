import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ActivePlanSyncProvider } from './contexts/ActivePlanSyncContext';
import { UserIdentityProvider } from './contexts/UserIdentityContext';
import { useGitHubAuth } from './hooks/useGitHubAuth';
import { useLocalIdentity } from './hooks/useLocalIdentity';
import { ArchivePage } from './pages/ArchivePage';
import { InboxPage } from './pages/InboxPage';
import { KanbanPage } from './pages/KanbanPage';
import { PlanPage } from './pages/PlanPage';
import { ResetPage } from './pages/ResetPage';
import { SearchPage } from './pages/SearchPage';
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
      <Route path="/" element={<Navigate to="/inbox" replace />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/board" element={<KanbanPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      {/* PlanPage handles both /plan/:id and /task/:id (legacy) and snapshots (/?d=...) */}
      <Route path="/plan/:id" element={<PlanPage />} />
      <Route path="/task/:id" element={<PlanPage />} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}

// Base path from Vite config for GitHub Pages deployment
const basename = import.meta.env.BASE_URL;

function AppWithLayout() {
  const { identity } = useGitHubAuth();
  const { localIdentity } = useLocalIdentity();

  // Check for reset param before any providers initialize
  // This prevents sync attempts that would re-populate storage
  // ONLY available in development mode for safety
  if (import.meta.env.DEV && hasResetParam()) {
    return <ResetPage />;
  }

  return (
    <UserIdentityProvider githubIdentity={identity} localIdentity={localIdentity}>
      <ActivePlanSyncProvider>
        <Layout>
          <AppRoutes />
        </Layout>
      </ActivePlanSyncProvider>
    </UserIdentityProvider>
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
