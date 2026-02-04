import type React from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { handleCallback, startWebFlow, validateToken } from '@/utils/github-web-flow';

const STORAGE_KEY = 'shipyard-github-identity';
const RETURN_URL_KEY = 'github-oauth-return-url';

const GitHubIdentitySchema = z.object({
  token: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().optional(),
  createdAt: z.number(),
  scope: z.string(),
});

export interface GitHubIdentity {
  token: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
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
  hasRepoScope: boolean;
  startAuth: (forceAccountPicker?: boolean) => void;
  requestRepoAccess: () => void;
  clearAuth: () => void;
}

let changeCounter = 0;
const listeners = new Set<() => void>();

interface SnapshotCache {
  counter: number;
  value: GitHubIdentity | null;
}

let snapshotCache: SnapshotCache | null = null;

function initializeSnapshotCache(): void {
  if (typeof localStorage !== 'undefined' && snapshotCache === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        const validated = GitHubIdentitySchema.safeParse(parsed);
        snapshotCache = {
          counter: changeCounter,
          value: validated.success ? validated.data : null,
        };
      } else {
        snapshotCache = { counter: changeCounter, value: null };
      }
    } catch {
      snapshotCache = { counter: changeCounter, value: null };
    }
  }
}

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
    const parsed: unknown = JSON.parse(stored);
    const validated = GitHubIdentitySchema.safeParse(parsed);
    if (!validated.success) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return validated.data;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
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
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return getStoredIdentity();
}

async function processOAuthCallback(
  code: string,
  state: string,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
  signal: AbortSignal
): Promise<void> {
  setAuthState({ status: 'exchanging_token' });

  try {
    const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
    const { token, user } = await handleCallback(code, state, redirectUri);

    if (signal.aborted) return;

    const ghIdMatch = user.id.match(/^gh_(\d+)$/);
    const avatarUrl = ghIdMatch
      ? `https://avatars.githubusercontent.com/u/${ghIdMatch[1]}`
      : undefined;

    const newIdentity: GitHubIdentity = {
      token,
      username: user.username,
      displayName: user.username,
      avatarUrl,
      createdAt: Date.now(),
      scope: '',
    };

    setStoredIdentity(newIdentity);
    setAuthState({ status: 'success' });

    const returnUrl = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);

    setTimeout(() => {
      if (signal.aborted) return;
      setAuthState({ status: 'idle' });
      if (returnUrl && returnUrl !== window.location.pathname) {
        window.location.href = returnUrl;
      }
    }, 1500);
  } catch (err) {
    if (signal.aborted) return;
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

  const hasRepoScope = identity?.scope?.includes('repo') ?? false;

  useEffect(() => {
    if (!identity) return;

    let cancelled = false;
    const token = identity.token;

    async function validate() {
      setIsValidating(true);
      const result = await validateToken(token);
      if (cancelled) return;

      if (result.status === 'invalid') {
        clearStoredIdentity();
      }
      setIsValidating(false);
    }

    validate();

    return () => {
      cancelled = true;
    };
  }, [identity]);

  const oauthProcessedRef = useRef(false);

  useEffect(() => {
    if (oauthProcessedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (code || error) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }

    if (error) {
      oauthProcessedRef.current = true;
      sessionStorage.removeItem(RETURN_URL_KEY);
      setAuthState({
        status: 'error',
        message: errorDescription || 'Authentication was denied',
      });
      return;
    }

    if (!code || !state) return;

    oauthProcessedRef.current = true;
    const abortController = new AbortController();
    processOAuthCallback(code, state, setAuthState, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, []);

  const startAuth = useCallback(
    (forceAccountPicker = false) => {
      if (authState.status === 'exchanging_token') {
        return;
      }

      const returnUrl = window.location.pathname + window.location.search + window.location.hash;
      sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

      const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
      startWebFlow(redirectUri, { forceAccountPicker });
    },
    [authState.status]
  );

  const requestRepoAccess = useCallback(() => {
    const returnUrl = window.location.pathname + window.location.search + window.location.hash;
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

    const redirectUri = window.location.origin + (import.meta.env.BASE_URL || '/');
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
