import { useCallback, useSyncExternalStore } from 'react';
import {
  clearIdentity,
  createIdentity,
  getIdentity,
  type UserIdentity,
  updateDisplayName,
} from '@/utils/identity';

/**
 * Subscribe to localStorage changes for identity.
 * This allows the hook to react to changes from other tabs.
 */
function subscribe(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === 'peer-plan-identity') {
      callback();
    }
  };

  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

/** Counter to force re-renders when identity changes in same tab */
let changeCounter = 0;
const listeners = new Set<() => void>();

/**
 * Cache for snapshot to avoid creating new objects on every call.
 * useSyncExternalStore requires stable references to prevent infinite loops.
 */
interface SnapshotCache {
  counter: number;
  value: UserIdentity | null;
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

function getSnapshot(): UserIdentity | null {
  // Return cached result if counter hasn't changed
  // This handles both identity=null and identity=object cases correctly
  if (snapshotCache !== null && snapshotCache.counter === changeCounter) {
    return snapshotCache.value;
  }

  const value = getIdentity();
  snapshotCache = { counter: changeCounter, value };
  return value;
}

function getServerSnapshot(): UserIdentity | null {
  return null;
}

export interface UseIdentityReturn {
  /** Current user identity, or null if not set */
  identity: UserIdentity | null;
  /** Whether the user has set up their identity */
  hasIdentity: boolean;
  /** Create a new identity with the given display name */
  create: (displayName: string) => UserIdentity;
  /** Update the display name */
  updateName: (displayName: string) => UserIdentity | null;
  /** Clear the identity (sign out) */
  clear: () => void;
}

/**
 * Hook for managing user identity.
 *
 * Provides reactive access to the user's identity stored in localStorage.
 * Automatically updates when identity changes (even from other tabs).
 */
export function useIdentity(): UseIdentityReturn {
  // Subscribe to both localStorage events (other tabs) and local changes
  const subscribeAll = useCallback((callback: () => void) => {
    const unsubStorage = subscribe(callback);
    const unsubLocal = subscribeLocal(callback);
    return () => {
      unsubStorage();
      unsubLocal();
    };
  }, []);

  const identity = useSyncExternalStore(subscribeAll, getSnapshot, getServerSnapshot);

  const create = useCallback((displayName: string) => {
    const newIdentity = createIdentity(displayName);
    notifyListeners();
    return newIdentity;
  }, []);

  const updateName = useCallback((displayName: string) => {
    const updated = updateDisplayName(displayName);
    notifyListeners();
    return updated;
  }, []);

  const clear = useCallback(() => {
    clearIdentity();
    notifyListeners();
  }, []);

  return {
    identity,
    hasIdentity: identity !== null,
    create,
    updateName,
    clear,
  };
}
