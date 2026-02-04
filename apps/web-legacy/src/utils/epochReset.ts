import { EPOCH_CLOSE_CODES, EPOCH_CLOSE_REASONS } from '@shipyard/schema';
import * as Y from 'yjs';

const RESET_ATTEMPTS_KEY = 'shipyard-epoch-reset-attempts';
const RESET_IN_PROGRESS_KEY = 'shipyard-epoch-reset-in-progress';
const MAX_RESET_ATTEMPTS = 2;

export function isEpochResetInProgress(): boolean {
  return sessionStorage.getItem(RESET_IN_PROGRESS_KEY) === 'true';
}

export function isEpochRejection(code: number, reason?: string): boolean {
  return (
    code === EPOCH_CLOSE_CODES.EPOCH_TOO_OLD ||
    reason === EPOCH_CLOSE_REASONS[EPOCH_CLOSE_CODES.EPOCH_TOO_OLD]
  );
}

async function deletePlanDatabase(planId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(planId);

    /*
     * 10s timeout: IndexedDB deletion usually completes in <1s
     * Handles blocked state when other tabs have open connections
     */
    const timeout = setTimeout(() => {
      resolve(false);
    }, 10000);

    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    request.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    request.onblocked = () => {
      /** IndexedDB deletion blocked by open connections - will succeed once they close */
    };
  });
}

function forceResetDocument(planId: string): void {
  try {
    const ydoc = new Y.Doc({ guid: planId });
    ydoc.destroy();
  } catch {
    /** Ignore Y.Doc errors - cleanup is best effort before redirect */
  }
  window.location.href = '/';
}

export async function handleEpochRejection(planId: string): Promise<void> {
  const attempts = Number.parseInt(sessionStorage.getItem(RESET_ATTEMPTS_KEY) || '0', 10);

  if (attempts >= MAX_RESET_ATTEMPTS) {
    sessionStorage.removeItem(RESET_ATTEMPTS_KEY);
    sessionStorage.removeItem(RESET_IN_PROGRESS_KEY);
    throw new Error('Failed to clear IndexedDB after 2 attempts. Manual intervention required.');
  }

  sessionStorage.setItem(RESET_ATTEMPTS_KEY, String(attempts + 1));
  sessionStorage.setItem(RESET_IN_PROGRESS_KEY, 'true');

  const success = await deletePlanDatabase(planId);

  if (success) {
    sessionStorage.removeItem(RESET_ATTEMPTS_KEY);
    sessionStorage.removeItem(RESET_IN_PROGRESS_KEY);
    window.location.reload();
  } else if (attempts + 1 >= MAX_RESET_ATTEMPTS) {
    forceResetDocument(planId);
  } else {
    window.location.reload();
  }
}
