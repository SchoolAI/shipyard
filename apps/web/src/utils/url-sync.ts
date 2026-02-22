import { useTaskStore } from '../stores/task-store';
import { useUIStore } from '../stores/ui-store';

const TASK_PATH_RE = /^\/tasks\/([^/]+)\/?$/;
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;
const SETTINGS_PATH = '/settings';
const COLLAB_PATH_RE = /^\/collab\/[^/]+\/?$/;

export const COLLAB_SESSION_KEY = 'shipyard-collab-session';

function isOwnedPath(pathname: string): boolean {
  return pathname === '/' || pathname === SETTINGS_PATH || TASK_PATH_RE.test(pathname);
}

function parseTaskIdFromPath(pathname: string): string | null {
  const match = TASK_PATH_RE.exec(pathname);
  const id = match?.[1];
  return id && TASK_ID_RE.test(id) ? id : null;
}

function hasActiveCollabSession(): boolean {
  return sessionStorage.getItem(COLLAB_SESSION_KEY) !== null;
}

function pathForState(taskId: string | null, isSettings: boolean): string {
  if (isSettings) return SETTINGS_PATH;
  if (!taskId) {
    sessionStorage.removeItem(COLLAB_SESSION_KEY);
    return '/';
  }
  if (hasActiveCollabSession()) return window.location.pathname;
  return `/tasks/${taskId}`;
}

export function navigateToSettings(): void {
  useUIStore.getState().setSettingsOpen(true);
}

export function navigateFromSettings(): void {
  const taskId = useTaskStore.getState().activeTaskId;
  const fallback = pathForState(taskId, false);
  useUIStore.getState().setSettingsOpen(false);
  window.history.replaceState(null, '', fallback);
}

export function initUrlSync(): () => void {
  let handlingPopstate = false;
  let closingSettingsForTaskSwitch = false;

  const initialPath = window.location.pathname;
  if (initialPath === SETTINGS_PATH) {
    useUIStore.getState().setSettingsOpen(true);
  } else {
    const initialId = parseTaskIdFromPath(initialPath);
    if (initialId) {
      useTaskStore.getState().setActiveTask(initialId);
    } else if (initialPath !== '/' && !COLLAB_PATH_RE.test(initialPath)) {
      window.history.replaceState(null, '', '/');
    }
  }

  const unsubTask = useTaskStore.subscribe((state, prev) => {
    if (handlingPopstate) return;
    if (state.activeTaskId === prev.activeTaskId) return;

    closingSettingsForTaskSwitch = true;
    useUIStore.getState().setSettingsOpen(false);
    closingSettingsForTaskSwitch = false;

    const target = pathForState(state.activeTaskId, false);
    if (window.location.pathname === target) return;

    window.history.pushState(null, '', target);
  });

  let prevSettingsOpen = useUIStore.getState().isSettingsOpen;
  const unsubUI = useUIStore.subscribe((state) => {
    if (handlingPopstate) return;
    if (closingSettingsForTaskSwitch) {
      prevSettingsOpen = state.isSettingsOpen;
      return;
    }

    const isSettings = state.isSettingsOpen;
    if (isSettings === prevSettingsOpen) return;
    prevSettingsOpen = isSettings;

    const taskId = useTaskStore.getState().activeTaskId;
    const target = pathForState(taskId, isSettings);
    if (window.location.pathname === target) return;

    window.history.pushState(null, '', target);
  });

  const onPopstate = () => {
    const path = window.location.pathname;
    if (!isOwnedPath(path)) return;

    handlingPopstate = true;
    try {
      if (path === SETTINGS_PATH) {
        useUIStore.getState().setSettingsOpen(true);
      } else {
        useUIStore.getState().setSettingsOpen(false);
        const id = parseTaskIdFromPath(path);
        const current = useTaskStore.getState().activeTaskId;
        if (id !== current) {
          useTaskStore.getState().setActiveTask(id);
        }
      }
    } finally {
      handlingPopstate = false;
    }
  };

  window.addEventListener('popstate', onPopstate);

  return () => {
    unsubTask();
    unsubUI();
    window.removeEventListener('popstate', onPopstate);
  };
}
