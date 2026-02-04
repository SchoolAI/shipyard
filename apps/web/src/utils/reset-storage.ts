const LOCAL_STORAGE_KEYS = [
  'shipyard-github-identity',
  'shipyard-sidebar-collapsed',
  'shipyard-show-archived',
  'shipyard-view-preferences',
  'kanban-hide-empty-columns',
  'shipyard:diff-view-mode',
  'theme',
] as const;

const SESSION_STORAGE_KEYS = [
  'github-oauth-state',
  'github-oauth-return-url',
  'shipyard-removed-servers',
] as const;

function isShipyardDatabase(name: string): boolean {
  if (name === 'shipyard-repo') return true;
  if (name === 'task-index') return true;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(name)) return true;

  if (name.startsWith('task-')) return true;

  if (name === '') return true;

  return false;
}

interface DeleteResult {
  success: boolean;
  blocked?: boolean;
  error?: string;
}

function deleteDatabase(name: string, timeoutMs = 10000): Promise<DeleteResult> {
  return new Promise((resolve) => {
    let wasBlocked = false;
    const request = indexedDB.deleteDatabase(name);

    const timeout = setTimeout(() => {
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

    request.onblocked = () => {
      wasBlocked = true;
    };
  });
}

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

async function clearIndexedDBFallback(): Promise<{
  cleared: string[];
  errors: string[];
}> {
  const cleared: string[] = [];
  const errors: string[] = [];
  const knownDatabases = ['shipyard-repo', 'task-index'];

  for (const name of knownDatabases) {
    const result = await deleteDatabase(name);
    processDeleteResult(name, result, cleared, errors);
  }

  return { cleared, errors };
}

async function clearIndexedDB(): Promise<{
  cleared: string[];
  errors: string[];
}> {
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

export function hasResetParam(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('reset') === 'all';
}

export function removeResetParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url.toString());
}
