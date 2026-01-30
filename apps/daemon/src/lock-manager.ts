/**
 * PID-based lock file management for daemon singleton
 *
 * Copied pattern from apps/server/src/registry-server.ts (lines 79-194)
 * Ensures only one daemon instance runs at a time per worktree.
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { daemonConfig } from './config.js';
import { logger } from './logger.js';

const MAX_LOCK_RETRIES = 3;

function getStateDir(): string {
  return daemonConfig.SHIPYARD_STATE_DIR;
}

function getLockFilePath(): string {
  return join(getStateDir(), 'daemon.lock');
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const errorObj = Object.fromEntries(Object.entries(error));
  return errorObj.code === code;
}

async function readLockHolderPid(): Promise<number | null> {
  try {
    const content = await readFile(getLockFilePath(), 'utf-8');
    const pidStr = content.split('\n')[0] ?? '';
    return Number.parseInt(pidStr, 10);
  } catch (readErr) {
    logger.error({ err: readErr }, 'Failed to read daemon lock file');
    return null;
  }
}

function isLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function tryRemoveStaleLock(stalePid: number, retryCount: number): Promise<boolean> {
  logger.warn({ stalePid, retryCount }, 'Removing stale daemon lock');
  try {
    await unlink(getLockFilePath());
    return true;
  } catch (unlinkErr) {
    logger.error({ err: unlinkErr }, 'Failed to remove stale daemon lock');
    return false;
  }
}

function registerLockCleanupHandler(): void {
  const lockFile = getLockFilePath();
  process.once('exit', () => {
    try {
      unlinkSync(lockFile);
    } catch {
      /** Lock may already be cleaned up */
    }
  });
}

async function handleExistingLock(retryCount: number): Promise<boolean> {
  const pid = await readLockHolderPid();
  if (pid === null) return false;

  if (isLockHolderAlive(pid)) {
    logger.info({ pid }, 'Daemon lock held by active process');
    return false;
  }

  /** Process dead - check retry limit before attempting removal */
  if (retryCount >= MAX_LOCK_RETRIES) {
    logger.error(
      { pid, retryCount },
      'Max retries exceeded while removing stale daemon lock'
    );
    return false;
  }

  /** Attempt to remove stale lock and retry */
  await tryRemoveStaleLock(pid, retryCount);
  return tryAcquireDaemonLock(retryCount + 1);
}

/**
 * Uses atomic file creation (wx flag) to prevent race conditions.
 */
export async function tryAcquireDaemonLock(retryCount = 0): Promise<boolean> {
  try {
    const stateDir = getStateDir();
    const lockFile = getLockFilePath();
    mkdirSync(stateDir, { recursive: true });
    await writeFile(lockFile, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
    registerLockCleanupHandler();
    logger.info({ pid: process.pid, lockFile }, 'Acquired daemon lock');
    return true;
  } catch (err) {
    if (hasErrorCode(err, 'EEXIST')) {
      return handleExistingLock(retryCount);
    }
    logger.error({ err }, 'Failed to acquire daemon lock');
    return false;
  }
}

export async function releaseDaemonLock(): Promise<void> {
  try {
    await unlink(getLockFilePath());
    logger.info('Released daemon lock');
  } catch {
    /** Lock file may already be cleaned up by exit handler */
    logger.debug('Daemon lock already released');
  }
}

/** Export for use in other modules */
export { getStateDir };
