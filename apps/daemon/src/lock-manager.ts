/**
 * PID-based lock file management for daemon singleton.
 * Ensures only one daemon instance runs at a time.
 */

import { mkdirSync, unlinkSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SHIPYARD_DIR = join(homedir(), '.shipyard');
const DAEMON_LOCK_FILE = join(SHIPYARD_DIR, 'daemon.lock');
const MAX_LOCK_RETRIES = 3;

function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const errorWithCode: { code: unknown } = error;
  return errorWithCode.code === code;
}

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

function isLockHolderAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

function registerLockCleanupHandler(): void {
  process.once('exit', () => {
    try {
      unlinkSync(DAEMON_LOCK_FILE);
    } catch {}
  });
}

async function handleExistingLock(retryCount: number): Promise<boolean> {
  const pid = await readLockHolderPid();
  if (pid === null) return false;

  if (isLockHolderAlive(pid)) {
    console.log(`Daemon lock held by active process (pid: ${pid})`);
    return false;
  }

  if (retryCount >= MAX_LOCK_RETRIES) {
    console.error(
      `Max retries exceeded while removing stale daemon lock (pid: ${pid}, retries: ${retryCount})`
    );
    return false;
  }

  await tryRemoveStaleLock(pid, retryCount);
  return tryAcquireDaemonLock(retryCount + 1);
}

/**
 * Uses atomic file creation (wx flag) to prevent race conditions.
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

export async function releaseDaemonLock(): Promise<void> {
  try {
    await unlink(DAEMON_LOCK_FILE);
    console.log('Released daemon lock');
  } catch (err) {
    console.debug('Daemon lock already released');
  }
}
