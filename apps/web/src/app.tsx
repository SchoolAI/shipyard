import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from './components/error-boundary';
import { Layout } from './components/layout';
import { ThemedToaster } from './components/themed-toaster';
import { ROUTES } from './constants/routes';
import { PresenceProvider } from './contexts/presence-provider';
import { UserIdentityProvider } from './contexts/user-identity-context';
import { useGitHubAuth } from './hooks/use-github-auth';
import { useLocalIdentity } from './hooks/use-local-identity';
import { ShipyardRepoProvider } from './loro/repo-provider';
import { HomePage } from './pages/home-page';
import { ResetPage } from './pages/reset-page';
import { hasResetParam } from './utils/reset-storage';

const InboxPage = lazy(() => import('./pages/inbox-page').then((m) => ({ default: m.InboxPage })));
const KanbanPage = lazy(() =>
  import('./pages/kanban-page').then((m) => ({ default: m.KanbanPage }))
);
const TaskPage = lazy(() => import('./pages/task-page').then((m) => ({ default: m.TaskPage })));
const ArchivePage = lazy(() =>
  import('./pages/archive-page').then((m) => ({ default: m.ArchivePage }))
);
const SearchPage = lazy(() =>
  import('./pages/search-page').then((m) => ({ default: m.SearchPage }))
);
const PreviewTestPage = lazy(() =>
  import('./pages/preview-test-page').then((m) => ({
    default: m.PreviewTestPage,
  }))
);

const LoadingFallback = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="text-muted-foreground">Loading...</div>
  </div>
);

function AppRoutes() {
  const [searchParams] = useSearchParams();
  const hasSnapshot = searchParams.has('d');

  if (hasSnapshot) {
    return (
      <Layout>
        <Suspense fallback={<LoadingFallback />}>
          <TaskPage />
        </Suspense>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path={ROUTES.HOME} element={<HomePage />} />
        <Route
          path={ROUTES.INBOX}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <InboxPage />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.BOARD}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <KanbanPage />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.TASK_PATTERN}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <TaskPage />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.ARCHIVE}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <ArchivePage />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.SEARCH}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SearchPage />
            </Suspense>
          }
        />
        <Route
          path={ROUTES.PREVIEW_TEST}
          element={
            <Suspense fallback={<LoadingFallback />}>
              <PreviewTestPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Layout>
  );
}

const basename = import.meta.env.BASE_URL;

function AppWithProviders() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            retry: 1,
          },
        },
      }),
    []
  );

  const { identity: githubIdentity } = useGitHubAuth();
  const { localIdentity } = useLocalIdentity();

  if (hasResetParam()) {
    return <ResetPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <UserIdentityProvider githubIdentity={githubIdentity} localIdentity={localIdentity}>
        <ShipyardRepoProvider>
          <PresenceProvider>
            <AppRoutes />
          </PresenceProvider>
        </ShipyardRepoProvider>
      </UserIdentityProvider>
    </QueryClientProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <AppWithProviders />
      </BrowserRouter>
      <ThemedToaster />
    </ErrorBoundary>
  );
}
