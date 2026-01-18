import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'peer-plan-local-identity';

export interface LocalIdentity {
  username: string;
  createdAt: number;
}

// Pure function: Parse stored identity
function parseStoredIdentity(stored: string | null): LocalIdentity | null {
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as LocalIdentity;
    // Validate structure
    if (typeof parsed.username !== 'string' || typeof parsed.createdAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Pure function: Serialize identity for storage
function serializeIdentity(identity: LocalIdentity): string {
  return JSON.stringify(identity);
}

// External store: Cross-tab sync with localStorage
let changeCounter = 0;
const listeners = new Set<() => void>();

interface SnapshotCache {
  counter: number;
  value: LocalIdentity | null;
}

// Initialize cache eagerly at module load to prevent race conditions
let snapshotCache: SnapshotCache | null = null;

function initializeSnapshotCache(): void {
  if (typeof localStorage !== 'undefined' && snapshotCache === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = parseStoredIdentity(stored);
      snapshotCache = { counter: changeCounter, value: parsed };
    } catch {
      snapshotCache = { counter: changeCounter, value: null };
    }
  }
}

// Run initialization immediately when module is loaded
initializeSnapshotCache();

function notifyListeners(): void {
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

function getStoredIdentity(): LocalIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return parseStoredIdentity(stored);
  } catch {
    return null;
  }
}

function setStoredIdentity(identity: LocalIdentity): void {
  localStorage.setItem(STORAGE_KEY, serializeIdentity(identity));
  notifyListeners();
}

function clearStoredIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  notifyListeners();
}

function getSnapshot(): LocalIdentity | null {
  if (snapshotCache !== null && snapshotCache.counter === changeCounter) {
    return snapshotCache.value;
  }
  const value = getStoredIdentity();
  snapshotCache = { counter: changeCounter, value };
  return value;
}

// SSR-safe: Return null on server, read from localStorage on hydration
function getServerSnapshot(): LocalIdentity | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return getStoredIdentity();
}

export interface UseLocalIdentityReturn {
  localIdentity: LocalIdentity | null;
  setLocalIdentity: (username: string) => void;
  clearLocalIdentity: () => void;
}

export function useLocalIdentity(): UseLocalIdentityReturn {
  const subscribeAll = useCallback((callback: () => void) => {
    const unsubStorage = subscribeStorage(callback);
    const unsubLocal = subscribeLocal(callback);
    return () => {
      unsubStorage();
      unsubLocal();
    };
  }, []);

  const localIdentity = useSyncExternalStore(subscribeAll, getSnapshot, getServerSnapshot);

  const setLocalIdentity = useCallback((username: string) => {
    // Issue 1: Reject reserved prefixes to prevent double-prefix vulnerability
    if (username.startsWith('local:') || username.startsWith('github:')) {
      throw new Error('Username cannot start with reserved prefixes (local:, github:)');
    }

    // Issue 2: Server-side validation (HTML5 pattern validation is client-side only)
    if (!/^[a-zA-Z0-9-]{2,39}$/.test(username)) {
      throw new Error('Username must be 2-39 characters: letters, numbers, and hyphens only');
    }

    const identity: LocalIdentity = {
      username,
      createdAt: Date.now(),
    };
    setStoredIdentity(identity);
  }, []);

  const clearLocalIdentity = useCallback(() => {
    clearStoredIdentity();
  }, []);

  return {
    localIdentity,
    setLocalIdentity,
    clearLocalIdentity,
  };
}
