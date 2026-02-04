import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { ActivePlanSyncProvider } from './contexts/ActivePlanSyncContext';
import { PlanIndexProvider } from './contexts/PlanIndexContext';
import { UserIdentityProvider } from './contexts/UserIdentityContext';
import { useGitHubAuth } from './hooks/useGitHubAuth';
import { useLocalIdentity } from './hooks/useLocalIdentity';
import { ArchivePage } from './pages/ArchivePage';
import { InboxPage } from './pages/InboxPage';
import { KanbanPage } from './pages/KanbanPage';
import { PlanPage } from './pages/PlanPage';
import { PreviewTestPage } from './pages/PreviewTestPage';
import { ResetPage } from './pages/ResetPage';
import { SearchPage } from './pages/SearchPage';
import { hasResetParam } from './utils/resetStorage';

function AppRoutes() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const hasSnapshot = searchParams.has('d');

  /*
   * If we have ?d= param (snapshot mode), show PlanPage regardless of path
   * Exception: /preview-test needs to work with ?d= for testing
   */
  if (hasSnapshot && location.pathname !== '/preview-test') {
    return <PlanPage />;
  }

  return (
    <Routes>
      {/* Root path - redirect to inbox unless there's a ?d= snapshot parameter */}
      <Route
        path="/"
        element={
          window.location.search.includes('?d=') || window.location.search.includes('&d=') ? (
            <PlanPage />
          ) : (
            <Navigate to="/inbox" replace />
          )
        }
      />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/board" element={<KanbanPage />} />
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/preview-test" element={<PreviewTestPage />} />
      {/* PlanPage handles both /task/:id and snapshots (/?d=...) */}
      <Route path="/task/:id" element={<PlanPage />} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}

/** Base path from Vite config for GitHub Pages deployment */
const basename = import.meta.env.BASE_URL;

function AppWithLayout() {
  const { identity } = useGitHubAuth();
  const { localIdentity } = useLocalIdentity();

  /*
   * Check for reset param before any providers initialize
   * This prevents sync attempts that would re-populate storage
   */
  if (hasResetParam()) {
    return <ResetPage />;
  }

  return (
    <UserIdentityProvider githubIdentity={identity} localIdentity={localIdentity}>
      <PlanIndexProvider>
        <ActivePlanSyncProvider>
          <Layout>
            <AppRoutes />
          </Layout>
        </ActivePlanSyncProvider>
      </PlanIndexProvider>
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
