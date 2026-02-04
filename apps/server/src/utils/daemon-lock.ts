/**
 * PID-based lock file management for daemon singleton.
 *
 * Ensures only one daemon instance runs at a time.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 *
 * Ported from apps/daemon-legacy/src/lock-manager.ts
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { getLockFilePath, getStateDir } from './paths.js';

const MAX_LOCK_RETRIES = 3;
const MAX_LOCK_AGE_MS = 60 * 1000; // 60 seconds - if lock is older than this and health check fails, assume stale

interface LockInfo {
  pid: number;
  timestamp: number;
}

/**
 * Type guard for NodeJS.ErrnoException.
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  if (!(err instanceof Error)) return false;
  if (!('code' in err)) return false;
  return typeof err.code === 'string' || typeof err.code === 'undefined';
}

/**
 * Check if an error has a specific code.
 */
function hasErrorCode(error: unknown, code: string): boolean {
  if (!isErrnoException(error)) {
    return false;
  }
  return error.code === code;
}

/**
 * Read lock file info (PID and timestamp).
 */
async function readLockInfo(): Promise<LockInfo | null> {
  try {
    const content = await readFile(getLockFilePath(), 'utf-8');
    const lines = content.split('\n');
    const pid = Number.parseInt(lines[0] ?? '', 10);
    const timestamp = Number.parseInt(lines[1] ?? '', 10);
    if (Number.isNaN(pid)) return null;
    return { pid, timestamp: Number.isNaN(timestamp) ? 0 : timestamp };
  } catch {
    return null;
  }
}

/**
 * Check if a process is alive by sending signal 0.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to remove a stale lock file.
 */
async function tryRemoveStaleLock(_stalePid: number): Promise<boolean> {
  try {
    await unlink(getLockFilePath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Register cleanup handlers to remove lock on process exit.
 *
 * IMPORTANT: We must handle signals explicitly because:
 * - 'exit' event only fires AFTER the process decides to exit
 * - SIGINT/SIGTERM default behavior is to terminate immediately
 * - Without signal handlers, Ctrl+C leaves stale lock files
 */
function registerLockCleanupHandler(): void {
  const lockFile = getLockFilePath();

  const cleanup = () => {
    try {
      unlinkSync(lockFile);
    } catch {
      /** Lock may already be cleaned up */
    }
  };

  // Handle clean exit
  process.once('exit', cleanup);

  // Handle termination signals - must explicitly exit after cleanup
  const signalHandler = (signal: string) => {
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143); // Standard exit codes
  };

  process.once('SIGINT', () => signalHandler('SIGINT'));
  process.once('SIGTERM', () => signalHandler('SIGTERM'));
  process.once('SIGHUP', () => signalHandler('SIGHUP'));
}

/**
 * Handle an existing lock file - check if holder is alive.
 */
async function handleExistingLock(retryCount: number): Promise<boolean> {
  const lockInfo = await readLockInfo();
  if (lockInfo === null) return false;

  const { pid, timestamp } = lockInfo;
  const lockAge = Date.now() - timestamp;

  // If process is alive and lock is recent, it's legitimately held
  if (isProcessAlive(pid) && lockAge < MAX_LOCK_AGE_MS) {
    return false;
  }

  // If lock is very old (> MAX_LOCK_AGE_MS), assume stale even if PID exists
  // This handles PID reuse where a different process got the same PID
  if (lockAge > MAX_LOCK_AGE_MS) {
    // Lock is old - likely stale (daemon should have updated or exited)
    await tryRemoveStaleLock(pid);
    return tryAcquireLock(retryCount + 1);
  }

  // Process is dead but lock is recent
  if (!isProcessAlive(pid)) {
    if (retryCount >= MAX_LOCK_RETRIES) {
      return false;
    }
    await tryRemoveStaleLock(pid);
    return tryAcquireLock(retryCount + 1);
  }

  return false;
}

/**
 * Try to acquire the daemon lock.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 *
 * @returns true if lock acquired, false if another daemon is running
 */
export async function tryAcquireLock(retryCount = 0): Promise<boolean> {
  try {
    const stateDir = getStateDir();
    const lockFile = getLockFilePath();

    mkdirSync(stateDir, { recursive: true });

    await writeFile(lockFile, `${process.pid}\n${Date.now()}`, { flag: 'wx' });

    registerLockCleanupHandler();

    return true;
  } catch (err) {
    if (hasErrorCode(err, 'EEXIST')) {
      return handleExistingLock(retryCount);
    }
    return false;
  }
}

/**
 * Release the daemon lock.
 */
export async function releaseLock(): Promise<void> {
  try {
    await unlink(getLockFilePath());
  } catch {
    /** Lock file may already be cleaned up by exit handler */
  }
}

/**
 * Check if the daemon lock is held (and holder is alive).
 */
export function isLocked(): boolean {
  try {
    const { readFileSync, existsSync } = require('node:fs');
    const lockPath = getLockFilePath();

    if (!existsSync(lockPath)) return false;

    const content = readFileSync(lockPath, 'utf-8');
    const pidStr = content.split('\n')[0] ?? '';
    const pid = Number.parseInt(pidStr, 10);

    if (Number.isNaN(pid)) return false;

    return isProcessAlive(pid);
  } catch {
    return false;
  }
}

/**
 * Synchronous lock acquisition for simple cases.
 * Prefer tryAcquireLock for most use cases.
 *
 * @returns true if lock acquired, false if another daemon is running
 */
export function acquireLock(): boolean {
  const { existsSync, readFileSync, writeFileSync } = require('node:fs');
  const lockPath = getLockFilePath();

  if (existsSync(lockPath)) {
    try {
      const pid = Number.parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
      if (!Number.isNaN(pid)) {
        if (isProcessAlive(pid)) {
          return false;
        }
        unlinkSync(lockPath);
      }
    } catch {}
  }

  mkdirSync(dirname(lockPath), { recursive: true });

  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
    registerLockCleanupHandler();
    return true;
  } catch {
    return false;
  }
}
