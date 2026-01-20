import type React from 'react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getGitHubUser,
  handleCallback,
  startWebFlow,
  validateToken,
} from '@/utils/github-web-flow';

const STORAGE_KEY = 'peer-plan-github-identity';
const RETURN_URL_KEY = 'github-oauth-return-url';

export interface GitHubIdentity {
  token: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
  /** OAuth scopes granted (space-separated). Empty string means basic identity only. */
  scope: string;
}

export type AuthState =
  | { status: 'idle' }
  | { status: 'exchanging_token' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export interface UseGitHubAuthReturn {
  identity: GitHubIdentity | null;
  isValidating: boolean;
  authState: AuthState;
  /** Whether the current token has `repo` scope for private repo access */
  hasRepoScope: boolean;
  /** Start basic auth flow (identity only, no repo access) */
  startAuth: (forceAccountPicker?: boolean) => void;
  /** Request upgrade to repo scope (for private repo artifacts) */
  requestRepoAccess: () => void;
  clearAuth: () => void;
}

let changeCounter = 0;
const listeners = new Set<() => void>();

interface SnapshotCache {
  counter: number;
  value: GitHubIdentity | null;
}

// Initialize cache eagerly at module load to prevent race conditions.
// This ensures the first call to getSnapshot() returns the stored value
// without needing to wait for any async operations.
let snapshotCache: SnapshotCache | null = null;

// Eagerly initialize the snapshot cache at module load time.
// This prevents race conditions where React might call getSnapshot()
// before the cache is populated.
function initializeSnapshotCache(): void {
  if (typeof localStorage !== 'undefined' && snapshotCache === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GitHubIdentity;
        snapshotCache = { counter: changeCounter, value: parsed };
      } else {
        snapshotCache = { counter: changeCounter, value: null };
      }
    } catch {
      snapshotCache = { counter: changeCounter, value: null };
    }
  }
}

// Run initialization immediately when module is loaded
initializeSnapshotCache();

function notifyListeners() {
  changeCounter++;
  snapshotCache = null;
  for (const listener of listeners) {
    listener();
  }
}

function subscribeLocal(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function subscribeStorage(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

function getStoredIdentity(): GitHubIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as GitHubIdentity;

    return parsed;
  } catch (err) {
    // Log parse errors to help debug localStorage corruption
    // biome-ignore lint/suspicious/noConsole: Intentional debugging log for localStorage corruption
    console.error('[useGitHubAuth] Failed to parse stored identity:', err);
    return null;
  }
}

function setStoredIdentity(identity: GitHubIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  notifyListeners();
}

function clearStoredIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyListeners();
}

function getSnapshot(): GitHubIdentity | null {
  if (snapshotCache !== null && snapshotCache.counter === changeCounter) {
    return snapshotCache.value;
  }
  const value = getStoredIdentity();
  snapshotCache = { counter: changeCounter, value };
  return value;
}

function getServerSnapshot(): GitHubIdentity | null {
  // In a pure client-side app, this shouldn't be called, but React's concurrent
  // features and StrictMode can sometimes use this during initial render.
  // To avoid race conditions where identity appears as null/undefined on first
  // render, we also read from localStorage here.
  // Note: This is safe because localStorage is synchronous and available in browsers.
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return getStoredIdentity();
}

async function processOAuthCallback(
  code: string,
  state: string,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
): Promise<void> {
  setAuthState({ status: 'exchanging_token' });

  try {
    const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
    const { access_token, scope, is_mobile } = await handleCallback(code, state, redirectUri);

    // Log mobile detection for debugging deep linking issues
    if (is_mobile) {
    }

    const user = await getGitHubUser(access_token);

    const newIdentity: GitHubIdentity = {
      token: access_token,
      username: user.login,
      displayName: user.name || user.login,
      avatarUrl: user.avatar_url,
      createdAt: Date.now(),
      scope: scope || '',
    };

    setStoredIdentity(newIdentity);
    setAuthState({ status: 'success' });

    // Check for stored return URL and navigate there
    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);

    // Reset to idle after success, then navigate if needed
    setTimeout(() => {
      setAuthState({ status: 'idle' });
      // Navigate to return URL if it differs from current path
      if (returnUrl && returnUrl !== window.location.pathname) {
        window.location.href = returnUrl;
      }
    }, 1500);
  } catch (err) {
    // Clean up return URL on error too
    sessionStorage.removeItem(RETURN_URL_KEY);
    setAuthState({
      status: 'error',
      message: err instanceof Error ? err.message : 'Authentication failed',
    });
  }
}

export function useGitHubAuth(): UseGitHubAuthReturn {
  const subscribeAll = useCallback((callback: () => void) => {
    const unsubStorage = subscribeStorage(callback);
    const unsubLocal = subscribeLocal(callback);
    return () => {
      unsubStorage();
      unsubLocal();
    };
  }, []);

  const identity = useSyncExternalStore(subscribeAll, getSnapshot, getServerSnapshot);
  const [isValidating, setIsValidating] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({ status: 'idle' });

  // Check if current token has repo scope
  const hasRepoScope = identity?.scope?.includes('repo') ?? false;

  // Validate existing token on mount
  // Only clears auth on confirmed 401 (invalid token), NOT on network/server errors
  useEffect(() => {
    if (!identity) return;

    let cancelled = false;
    const token = identity.token;

    async function validate() {
      setIsValidating(true);
      const result = await validateToken(token);
      if (cancelled) return;

      if (result.status === 'invalid') {
        // Token is genuinely invalid (401 from GitHub) - clear auth
        clearStoredIdentity();
      }
      // For 'valid' or 'error' status, keep the session
      // Network errors, rate limits, server errors shouldn't log users out
      setIsValidating(false);
    }

    validate();

    return () => {
      cancelled = true;
    };
  }, [identity]);

  // Handle OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    // Clean URL immediately if we have OAuth params
    if (code || error) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }

    // Handle error from GitHub (e.g., user denied access)
    if (error) {
      sessionStorage.removeItem(RETURN_URL_KEY);
      setAuthState({
        status: 'error',
        message: errorDescription || 'Authentication was denied',
      });
      return;
    }

    // Handle successful callback with code
    if (code && state) {
      processOAuthCallback(code, state, setAuthState);
    }
  }, []);

  const startAuth = useCallback((forceAccountPicker = false) => {
    // Store current URL to return to after auth
    const returnUrl = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

    const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
    startWebFlow(redirectUri, { forceAccountPicker });
  }, []);

  const requestRepoAccess = useCallback(() => {
    // Store current URL to return to after auth
    const returnUrl = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

    const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
    // Request repo scope - this will replace the existing token
    // Don't clear identity here - causes UI flicker. OAuth callback will replace it.
    startWebFlow(redirectUri, { scope: 'repo', forceConsent: true });
  }, []);

  const clearAuth = useCallback(() => {
    clearStoredIdentity();
    setAuthState({ status: 'idle' });
  }, []);

  return {
    identity,
    isValidating,
    authState,
    hasRepoScope,
    startAuth,
    requestRepoAccess,
    clearAuth,
  };
}
