import { change, type TypedDoc } from '@loro-extended/change';
import type { TaskDocumentShape } from '@shipyard/loro-schema';

export interface CrashRecoveryLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Detect and recover a task document left in a stuck state by a daemon crash.
 *
 * When the daemon crashes mid-session, meta.status stays on 'working',
 * 'starting', or 'input-required'. On restart, the status gate in
 * onTaskDocChanged() blocks new work. This function resets the status
 * so the task can accept new user messages.
 *
 * Returns true if recovery was performed, false if no recovery needed.
 */
export function recoverOrphanedTask(
  taskDoc: TypedDoc<TaskDocumentShape>,
  log: CrashRecoveryLogger
): boolean {
  const json = taskDoc.toJSON();
  const { status } = json.meta;

  if (status !== 'working' && status !== 'starting' && status !== 'input-required') {
    return false;
  }

  const sessions = json.sessions;
  let lastActiveIdx = -1;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s?.status === 'active' || s?.status === 'pending') {
      lastActiveIdx = i;
      break;
    }
  }

  change(taskDoc, (draft) => {
    if (lastActiveIdx >= 0) {
      const session = draft.sessions.get(lastActiveIdx);
      if (session) {
        session.status = 'interrupted';
        session.completedAt = Date.now();
        session.error = 'Daemon process exited unexpectedly';
      }
    }
    draft.meta.status = 'failed';
    draft.meta.updatedAt = Date.now();
  });

  log.info({ previousStatus: status }, 'Recovered orphaned task after daemon crash');
  return true;
}
