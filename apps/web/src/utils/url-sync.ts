import { useTaskStore } from '../stores/task-store';

const TASK_PATH_RE = /^\/tasks\/([^/]+)\/?$/;
const TASK_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isOwnedPath(pathname: string): boolean {
  return pathname === '/' || TASK_PATH_RE.test(pathname);
}

function parseTaskIdFromPath(pathname: string): string | null {
  const match = TASK_PATH_RE.exec(pathname);
  const id = match?.[1];
  return id && TASK_ID_RE.test(id) ? id : null;
}

function pathForTaskId(id: string | null): string {
  return id ? `/tasks/${id}` : '/';
}

export function initUrlSync(): () => void {
  let handlingPopstate = false;

  const initialId = parseTaskIdFromPath(window.location.pathname);
  if (initialId) {
    useTaskStore.getState().setActiveTask(initialId);
  } else if (window.location.pathname !== '/') {
    window.history.replaceState(null, '', '/');
  }

  const unsubscribe = useTaskStore.subscribe((state, prev) => {
    if (handlingPopstate) return;
    if (state.activeTaskId === prev.activeTaskId) return;

    const target = pathForTaskId(state.activeTaskId);
    if (window.location.pathname === target) return;

    window.history.pushState(null, '', target);
  });

  const onPopstate = () => {
    const path = window.location.pathname;
    if (!isOwnedPath(path)) return;

    handlingPopstate = true;
    try {
      const id = parseTaskIdFromPath(path);
      const current = useTaskStore.getState().activeTaskId;
      if (id !== current) {
        useTaskStore.getState().setActiveTask(id);
      }
    } finally {
      handlingPopstate = false;
    }
  };

  window.addEventListener('popstate', onPopstate);

  return () => {
    unsubscribe();
    window.removeEventListener('popstate', onPopstate);
  };
}
