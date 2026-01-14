/**
 * Nuclear reset utility for clearing all peer-plan storage.
 * Used for local testing when you need a clean slate across all peers.
 */

/**
 * All localStorage keys used by peer-plan
 */
const LOCAL_STORAGE_KEYS = [
  'peer-plan-github-identity',
  'peer-plan-sidebar-collapsed',
  'peer-plan-show-archived',
  'peer-plan-view-preferences',
  'theme',
] as const;

/**
 * All sessionStorage keys used by peer-plan
 */
const SESSION_STORAGE_KEYS = [
  'github-oauth-state',
  'github-oauth-return-url',
  'peer-plan-removed-servers',
] as const;

/**
 * Check if an IndexedDB database name belongs to peer-plan
 */
function isPeerPlanDatabase(name: string): boolean {
  if (name === 'plan-index') return true;

  // UUID pattern: 8-4-4-4-12 hex chars
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(name)) return true;

  if (name.startsWith('plan-')) return true;

  return false;
}

interface DeleteResult {
  success: boolean;
  blocked?: boolean;
  error?: string;
}

/**
 * Delete a single IndexedDB database by name
 */
function deleteDatabase(name: string): Promise<DeleteResult> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve({ success: true });
    request.onerror = () =>
      resolve({ success: false, error: request.error?.message ?? 'Unknown error' });
    request.onblocked = () => resolve({ success: false, blocked: true });
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
async function clearIndexedDBFallback(): Promise<{ cleared: string[]; errors: string[] }> {
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
 * Clear all IndexedDB databases created by peer-plan
 */
async function clearIndexedDB(): Promise<{ cleared: string[]; errors: string[] }> {
  // Fallback for browsers without indexedDB.databases()
  if (!('databases' in indexedDB)) {
    return clearIndexedDBFallback();
  }

  const cleared: string[] = [];
  const errors: string[] = [];
  const databases = await indexedDB.databases();

  for (const db of databases) {
    const name = db.name;
    if (!name || !isPeerPlanDatabase(name)) continue;

    const result = await deleteDatabase(name);
    processDeleteResult(name, result, cleared, errors);
  }

  return { cleared, errors };
}

/**
 * Clear all localStorage keys used by peer-plan
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
 * Clear all sessionStorage keys used by peer-plan
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
 * Clear all peer-plan storage from the browser.
 * This is the browser-side component of the full reset flow.
 *
 * NOTE: For a complete reset, you also need to:
 * 1. Stop all MCP server instances
 * 2. Clear ~/.peer-plan/plans/ on the server side
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
