import type React from 'react';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  getGitHubUser,
  handleCallback,
  startWebFlow,
  validateToken,
} from '@/utils/github-web-flow';

const STORAGE_KEY = 'peer-plan-github-identity';

export interface GitHubIdentity {
  token: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
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
  startAuth: (forceAccountPicker?: boolean) => void;
  clearAuth: () => void;
}

let changeCounter = 0;
const listeners = new Set<() => void>();

interface SnapshotCache {
  counter: number;
  value: GitHubIdentity | null;
}

let snapshotCache: SnapshotCache | null = null;

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
    return JSON.parse(stored) as GitHubIdentity;
  } catch {
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
  return null;
}

async function processOAuthCallback(
  code: string,
  state: string,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
): Promise<void> {
  setAuthState({ status: 'exchanging_token' });

  try {
    const redirectUri = window.location.origin;
    const { access_token } = await handleCallback(code, state, redirectUri);

    const user = await getGitHubUser(access_token);

    const newIdentity: GitHubIdentity = {
      token: access_token,
      username: user.login,
      displayName: user.name || user.login,
      avatarUrl: user.avatar_url,
      createdAt: Date.now(),
    };

    setStoredIdentity(newIdentity);
    setAuthState({ status: 'success' });

    // Reset to idle after success
    setTimeout(() => {
      setAuthState({ status: 'idle' });
    }, 1500);
  } catch (err) {
    setAuthState({
      status: 'error',
      message: err instanceof Error ? err.message : 'Authentication failed',
    });
  }
}

export interface UseGitHubAuthReturn {
  identity: GitHubIdentity | null;
  isValidating: boolean;
  authState: AuthState;
  startAuth: () => void;
  clearAuth: () => void;
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

  // Validate existing token on mount
  useEffect(() => {
    if (!identity) return;

    let cancelled = false;
    const token = identity.token;

    async function validate() {
      setIsValidating(true);
      const isValid = await validateToken(token);
      if (cancelled) return;

      if (!isValid) {
        clearStoredIdentity();
      }
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
    const redirectUri = window.location.origin;
    startWebFlow(redirectUri, forceAccountPicker);
  }, []);

  const clearAuth = useCallback(() => {
    clearStoredIdentity();
    setAuthState({ status: 'idle' });
  }, []);

  return {
    identity,
    isValidating,
    authState,
    startAuth,
    clearAuth,
  };
}
