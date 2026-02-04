import { useEffect, useState } from 'react';
import { type ResetResult, removeResetParam, resetAllBrowserStorage } from '../utils/reset-storage';

type ResetState = 'pending' | 'in-progress' | 'complete' | 'error';

export function ResetPage() {
  const [state, setState] = useState<ResetState>('pending');
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function performReset() {
      setState('in-progress');

      try {
        const resetResult = await resetAllBrowserStorage();
        setResult(resetResult);
        setState('complete');

        const hasErrors = resetResult.indexedDB.errors.length > 0;
        const delay = hasErrors ? 8000 : 3000;
        setTimeout(() => {
          removeResetParam();
          const basePath = import.meta.env.BASE_URL || '/';
          window.location.href = basePath;
        }, delay);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    }

    performReset();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-lg border border-separator bg-surface p-6 shadow-xl">
        <h1 className="mb-4 text-xl font-bold text-foreground">Storage Reset</h1>

        {state === 'pending' && (
          <p className="text-muted-foreground">Preparing to reset all browser storage...</p>
        )}

        {state === 'in-progress' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-foreground">Clearing browser storage...</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This will clear all task data, identity, and preferences.
            </p>
            <p className="text-sm text-muted-foreground/60">
              This may take up to 10 seconds if databases have open connections.
            </p>
          </div>
        )}

        {state === 'complete' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Success</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="font-medium">Reset Complete!</span>
            </div>

            <div className="space-y-2 text-sm">
              {result.indexedDB.cleared.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">IndexedDB cleared:</p>
                  <ul className="ml-4 text-muted-foreground">
                    {result.indexedDB.cleared.map((db) => (
                      <li key={db}>{db}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.indexedDB.errors.length > 0 && (
                <div>
                  <p className="font-medium text-warning">IndexedDB errors:</p>
                  <ul className="ml-4 text-warning/80">
                    {result.indexedDB.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.localStorage.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">localStorage cleared:</p>
                  <ul className="ml-4 text-muted-foreground">
                    {result.localStorage.map((key) => (
                      <li key={key}>{key}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.sessionStorage.length > 0 && (
                <div>
                  <p className="font-medium text-foreground">sessionStorage cleared:</p>
                  <ul className="ml-4 text-muted-foreground">
                    {result.sessionStorage.map((key) => (
                      <li key={key}>{key}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.indexedDB.cleared.length === 0 &&
                result.localStorage.length === 0 &&
                result.sessionStorage.length === 0 && (
                  <p className="text-muted-foreground">No shipyard data found to clear.</p>
                )}
            </div>

            <p className="text-sm text-muted-foreground">
              Redirecting to home page in {result.indexedDB.errors.length > 0 ? '8' : '3'}{' '}
              seconds...
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-danger">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <title>Error</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="font-medium">Reset Failed</span>
            </div>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded bg-surface-2 px-4 py-2 text-sm text-foreground hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
