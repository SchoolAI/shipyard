import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessDeniedError,
  type AccessTokenResponse,
  type DeviceCodeResponse,
  ExpiredTokenError,
  getGitHubUser,
  pollForToken,
  SlowDownError,
  startDeviceFlow,
  validateToken,
} from '@/utils/github-device-flow';

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
  | { status: 'awaiting_code'; deviceCode: DeviceCodeResponse }
  | { status: 'polling'; deviceCode: DeviceCodeResponse }
  | { status: 'success' }
  | { status: 'error'; message: string };

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PollResult =
  | { status: 'success'; token: AccessTokenResponse }
  | { status: 'cancelled' }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'timeout' }
  | { status: 'error'; message: string };

function handlePollError(error: unknown): PollResult | 'slow_down' {
  if (error instanceof SlowDownError) return 'slow_down';
  if (error instanceof ExpiredTokenError) return { status: 'expired' };
  if (error instanceof AccessDeniedError) return { status: 'denied' };
  return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
}

async function pollUntilComplete(
  deviceCode: DeviceCodeResponse,
  cancelRef: React.RefObject<boolean>
): Promise<PollResult> {
  let currentInterval = deviceCode.interval;
  const expiresAt = Date.now() + deviceCode.expires_in * 1000;

  while (Date.now() < expiresAt) {
    if (cancelRef.current) return { status: 'cancelled' };

    await sleep(currentInterval * 1000);

    try {
      const result = await pollForToken(deviceCode.device_code);
      if (result) return { status: 'success', token: result };
    } catch (error) {
      const errorResult = handlePollError(error);
      if (errorResult === 'slow_down') {
        currentInterval += 5;
        continue;
      }
      return errorResult;
    }
  }

  return { status: 'timeout' };
}

export interface UseGitHubAuthReturn {
  identity: GitHubIdentity | null;
  isValidating: boolean;
  authState: AuthState;
  startAuth: () => Promise<void>;
  clearAuth: () => void;
  cancelAuth: () => void;
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
  const cancelRequestedRef = useRef(false);

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

  const startAuth = useCallback(async () => {
    cancelRequestedRef.current = false;
    setAuthState({ status: 'idle' });

    try {
      const deviceCode = await startDeviceFlow();
      setAuthState({ status: 'polling', deviceCode });

      const pollResult = await pollUntilComplete(deviceCode, cancelRequestedRef);

      switch (pollResult.status) {
        case 'success':
          await completeAuth(pollResult.token);
          setAuthState({ status: 'success' });
          break;
        case 'cancelled':
          setAuthState({ status: 'idle' });
          break;
        case 'expired':
          setAuthState({ status: 'error', message: 'The code has expired. Please try again.' });
          break;
        case 'denied':
          setAuthState({
            status: 'error',
            message: 'Authentication was denied. Please try again.',
          });
          break;
        case 'timeout':
          setAuthState({ status: 'error', message: 'Authentication timed out. Please try again.' });
          break;
        case 'error':
          setAuthState({ status: 'error', message: pollResult.message });
          break;
      }
    } catch (error) {
      setAuthState({
        status: 'error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    }
  }, []);

  const clearAuth = useCallback(() => {
    clearStoredIdentity();
    setAuthState({ status: 'idle' });
  }, []);

  const cancelAuth = useCallback(() => {
    cancelRequestedRef.current = true;
    setAuthState({ status: 'idle' });
  }, []);

  return {
    identity,
    isValidating,
    authState,
    startAuth,
    clearAuth,
    cancelAuth,
  };
}

async function completeAuth(tokenResponse: AccessTokenResponse): Promise<void> {
  const user = await getGitHubUser(tokenResponse.access_token);

  const identity: GitHubIdentity = {
    token: tokenResponse.access_token,
    username: user.login,
    displayName: user.name || user.login,
    avatarUrl: user.avatar_url,
    createdAt: Date.now(),
  };

  setStoredIdentity(identity);
}
