import { change, type TypedDoc } from '@loro-extended/change';
import type { TaskIndexDocumentShape, WorktreeSetupStatus } from '@shipyard/loro-schema';

/**
 * Check whether a process with the given PID is alive.
 * Uses `process.kill(pid, 0)` which sends no signal but throws ESRCH
 * if the process does not exist.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface Logger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

interface ClassifiedEntries {
  staleKeys: string[];
  orphanedEntries: Array<{ path: string; entry: WorktreeSetupStatus }>;
}

/** Classify entries as stale (old terminal) or orphaned (dead PID on this machine). */
function classifyEntries(
  entries: Record<string, WorktreeSetupStatus>,
  localMachineId: string,
  cutoff: number
): ClassifiedEntries {
  const staleKeys: string[] = [];
  const orphanedEntries: Array<{ path: string; entry: WorktreeSetupStatus }> = [];

  for (const [path, entry] of Object.entries(entries)) {
    if (entry.status !== 'running') {
      if (entry.completedAt && entry.completedAt < cutoff) {
        staleKeys.push(path);
      }
      continue;
    }

    if (entry.machineId === localMachineId) {
      const alive = entry.pid != null && isPidAlive(entry.pid);
      if (!alive) {
        orphanedEntries.push({ path, entry });
      }
    }
  }

  return { staleKeys, orphanedEntries };
}

/**
 * Clean up stale and orphaned worktree setup status entries from the CRDT.
 *
 * - Terminal entries (`done`/`failed`) older than 7 days are deleted.
 * - `running` entries from this machine whose PID is dead are marked `failed`.
 * - `running` entries from other machines are left alone (that machine's daemon
 *   is responsible for its own cleanup).
 *
 * Called on daemon startup after capabilities are published.
 */
export function cleanupStaleSetupEntries(
  roomDoc: TypedDoc<TaskIndexDocumentShape>,
  localMachineId: string,
  log: Logger
): void {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - SEVEN_DAYS_MS;

  try {
    const json = roomDoc.toJSON();
    const entries = json.worktreeSetupStatus ?? {};
    const { staleKeys, orphanedEntries } = classifyEntries(entries, localMachineId, cutoff);

    if (staleKeys.length === 0 && orphanedEntries.length === 0) return;

    change(roomDoc, (draft) => {
      for (const key of staleKeys) {
        draft.worktreeSetupStatus.delete(key);
      }
      for (const { path, entry } of orphanedEntries) {
        draft.worktreeSetupStatus.set(path, {
          ...entry,
          status: 'failed',
          completedAt: Date.now(),
        });
      }
    });

    if (staleKeys.length > 0) {
      log.info({ count: staleKeys.length }, 'Cleaned up stale worktree setup status entries');
    }
    if (orphanedEntries.length > 0) {
      log.info(
        { count: orphanedEntries.length, paths: orphanedEntries.map((e) => e.path) },
        'Marked orphaned running setup entries as failed'
      );
    }
  } catch (err: unknown) {
    log.warn({ err }, 'Failed to clean up stale worktree setup status entries');
  }
}
