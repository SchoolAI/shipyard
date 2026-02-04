/**
 * Nuclear reset utility for clearing all shipyard storage.
 * Used for local testing when you need a clean slate across all peers.
 */

/**
 * All localStorage keys used by shipyard
 */
const LOCAL_STORAGE_KEYS = [
  'shipyard-github-identity',
  'shipyard-sidebar-collapsed',
  'shipyard-show-archived',
  'shipyard-view-preferences',
  'kanban-hide-empty-columns',
  'shipyard:diff-view-mode',
  'theme',
] as const;

/**
 * All sessionStorage keys used by shipyard
 */
const SESSION_STORAGE_KEYS = [
  'github-oauth-state',
  'github-oauth-return-url',
  'shipyard-removed-servers',
] as const;

/**
 * Check if an IndexedDB database name belongs to shipyard
 */
function isShipyardDatabase(name: string): boolean {
  if (name === 'plan-index') return true;

  /** UUID pattern: 8-4-4-4-12 hex chars */
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(name)) return true;

  if (name.startsWith('plan-')) return true;

  /** Empty database name (sometimes created by y-indexeddb) */
  if (name === '') return true;

  return false;
}

interface DeleteResult {
  success: boolean;
  blocked?: boolean;
  error?: string;
}

/**
 * Delete a single IndexedDB database by name.
 *
 * IMPORTANT: The `onblocked` event is just a warning that connections exist.
 * The deletion WILL still proceed once all connections close. We need to wait
 * for `onsuccess`, not bail early on `onblocked`.
 *
 * @param name Database name to delete
 * @param timeoutMs Maximum time to wait for deletion (default: 10 seconds)
 */
function deleteDatabase(name: string, timeoutMs = 10000): Promise<DeleteResult> {
  return new Promise((resolve) => {
    let wasBlocked = false;
    const request = indexedDB.deleteDatabase(name);

    const timeout = setTimeout(() => {
      /** If still waiting after timeout, report as blocked */
      resolve({
        success: false,
        blocked: wasBlocked,
        error: wasBlocked ? 'Timed out waiting for connections to close' : 'Deletion timed out',
      });
    }, timeoutMs);

    request.onsuccess = () => {
      clearTimeout(timeout);
      resolve({ success: true });
    };

    request.onerror = () => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: request.error?.message ?? 'Unknown error',
      });
    };

    /*
     * onblocked means there are open connections, but deletion will proceed
     * once they close. We just note it and keep waiting for onsuccess.
     */
    request.onblocked = () => {
      wasBlocked = true;
      /** Don't resolve here - wait for onsuccess or timeout */
    };
  });
}

/**
 * Process delete results for a database
 */
function processDeleteResult(
  name: string,
  result: DeleteResult,
  cleared: string[],
  errors: string[]
): void {
  if (result.success) {
    cleared.push(name);
  } else if (result.blocked) {
    errors.push(`${name} (blocked - close all tabs)`);
  } else {
    errors.push(`${name}: ${result.error}`);
  }
}

/**
 * Clear IndexedDB databases using fallback method (for older browsers)
 */
async function clearIndexedDBFallback(): Promise<{
  cleared: string[];
  errors: string[];
}> {
  const cleared: string[] = [];
  const errors: string[] = [];
  const knownDatabases = ['plan-index'];

  for (const name of knownDatabases) {
    const result = await deleteDatabase(name);
    processDeleteResult(name, result, cleared, errors);
  }

  return { cleared, errors };
}

/**
 * Clear all IndexedDB databases created by shipyard
 */
async function clearIndexedDB(): Promise<{
  cleared: string[];
  errors: string[];
}> {
  /** Fallback for browsers without indexedDB.databases() */
  if (!('databases' in indexedDB)) {
    return clearIndexedDBFallback();
  }

  const cleared: string[] = [];
  const errors: string[] = [];
  const databases = await indexedDB.databases();

  for (const db of databases) {
    const name = db.name;
    if (!name || !isShipyardDatabase(name)) continue;

    const result = await deleteDatabase(name);
    processDeleteResult(name, result, cleared, errors);
  }

  return { cleared, errors };
}

/**
 * Clear all localStorage keys used by shipyard
 */
function clearLocalStorage(): string[] {
  const cleared: string[] = [];
  for (const key of LOCAL_STORAGE_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      cleared.push(key);
    }
  }
  return cleared;
}

/**
 * Clear all sessionStorage keys used by shipyard
 */
function clearSessionStorage(): string[] {
  const cleared: string[] = [];
  for (const key of SESSION_STORAGE_KEYS) {
    if (sessionStorage.getItem(key) !== null) {
      sessionStorage.removeItem(key);
      cleared.push(key);
    }
  }
  return cleared;
}

export interface ResetResult {
  indexedDB: { cleared: string[]; errors: string[] };
  localStorage: string[];
  sessionStorage: string[];
}

/**
 * Clear all shipyard storage from the browser.
 * This is the browser-side component of the full reset flow.
 *
 * NOTE: For a complete reset, you also need to:
 * 1. Stop all MCP server instances
 * 2. Clear ~/.shipyard/plans/ on the server side
 */
export async function resetAllBrowserStorage(): Promise<ResetResult> {
  const indexedDBResult = await clearIndexedDB();
  const localStorageResult = clearLocalStorage();
  const sessionStorageResult = clearSessionStorage();

  return {
    indexedDB: indexedDBResult,
    localStorage: localStorageResult,
    sessionStorage: sessionStorageResult,
  };
}

/**
 * Check if the URL has the reset query parameter
 */
export function hasResetParam(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('reset') === 'all';
}

/**
 * Remove the reset query parameter from the URL without reload
 */
export function removeResetParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url.toString());
}
