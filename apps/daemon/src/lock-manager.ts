/**
 * PID-based lock file management for daemon singleton
 *
 * Copied pattern from apps/server/src/registry-server.ts (lines 79-194)
 * Ensures only one daemon instance runs at a time.
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHIPYARD_DIR = join(homedir(), '.shipyard');
const DAEMON_LOCK_FILE = join(SHIPYARD_DIR, 'daemon.lock');
const MAX_LOCK_RETRIES = 3;

/**
 * Type guard for error codes
 */
function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

/**
 * Reads the PID from the lock file.
 * Returns null if file doesn't exist or is invalid.
 */
async function readLockHolderPid(): Promise<number | null> {
  try {
    const content = await readFile(DAEMON_LOCK_FILE, 'utf-8');
    const pidStr = content.split('\n')[0] ?? '';
    return Number.parseInt(pidStr, 10);
  } catch (readErr) {
    console.error('Failed to read daemon lock file:', readErr);
    return null;
  }
}

/**
 * Checks if the lock holder process is alive.
 * Returns true if process is alive, false if dead or unknown.
 */
function isLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to remove a stale lock file.
 * Returns true if removal succeeded or was unnecessary.
 */
async function tryRemoveStaleLock(stalePid: number, retryCount: number): Promise<boolean> {
  console.warn(`Removing stale daemon lock (pid: ${stalePid}, retry: ${retryCount})`);
  try {
    await unlink(DAEMON_LOCK_FILE);
    return true;
  } catch (unlinkErr) {
    console.error('Failed to remove stale daemon lock:', unlinkErr);
    return false;
  }
}

/**
 * Registers cleanup handler to remove lock file on process exit.
 */
function registerLockCleanupHandler(): void {
  process.once('exit', () => {
    try {
      unlinkSync(DAEMON_LOCK_FILE);
    } catch {
      /** Lock may already be cleaned up */
    }
  });
}

/**
 * Handles the case when lock file already exists.
 * Checks if holder is alive, and if not, removes stale lock and retries.
 * Returns true if lock was acquired on retry, false otherwise.
 */
async function handleExistingLock(retryCount: number): Promise<boolean> {
  const pid = await readLockHolderPid();
  if (pid === null) return false;

  if (isLockHolderAlive(pid)) {
    console.log(`Daemon lock held by active process (pid: ${pid})`);
    return false;
  }

  /** Process dead - check retry limit before attempting removal */
  if (retryCount >= MAX_LOCK_RETRIES) {
    console.error(
      `Max retries exceeded while removing stale daemon lock (pid: ${pid}, retries: ${retryCount})`
    );
    return false;
  }

  /** Attempt to remove stale lock and retry */
  await tryRemoveStaleLock(pid, retryCount);
  return tryAcquireDaemonLock(retryCount + 1);
}

/**
 * Attempts to acquire exclusive lock for daemon startup.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 * Returns true if lock acquired, false if another process holds the lock.
 * Max retries: 3 attempts to remove stale locks before giving up.
 */
export async function tryAcquireDaemonLock(retryCount = 0): Promise<boolean> {
  try {
    mkdirSync(SHIPYARD_DIR, { recursive: true });
    await writeFile(DAEMON_LOCK_FILE, `${process.pid}\n${Date.now()}`, { flag: 'wx' });
    registerLockCleanupHandler();
    console.log(`Acquired daemon lock (pid: ${process.pid})`);
    return true;
  } catch (err) {
    if (hasErrorCode(err, 'EEXIST')) {
      return handleExistingLock(retryCount);
    }
    console.error('Failed to acquire daemon lock:', err);
    return false;
  }
}

/**
 * Releases the daemon lock file.
 * Called on graceful shutdown.
 */
export async function releaseDaemonLock(): Promise<void> {
  try {
    await unlink(DAEMON_LOCK_FILE);
    console.log('Released daemon lock');
  } catch (err) {
    /** Lock file may already be cleaned up by exit handler */
    console.debug('Daemon lock already released');
  }
}
