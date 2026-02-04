/**
 * State directory paths.
 *
 * Helpers for locating Shipyard state directories.
 * Ported from apps/server-legacy/src/config/env/registry.ts
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** Base directory for Shipyard state */
const SHIPYARD_DIR = '.shipyard';

/**
 * Get the Shipyard state directory.
 * Uses SHIPYARD_STATE_DIR env var if set, otherwise ~/.shipyard
 */
export function getStateDir(): string {
  return process.env.SHIPYARD_STATE_DIR || join(homedir(), SHIPYARD_DIR);
}

/**
 * Get the persistence directory for LevelDB storage.
 */
export function getPersistenceDir(): string {
  return join(getStateDir(), 'persistence');
}

/**
 * Get the lock file path for daemon singleton.
 */
export function getLockFilePath(): string {
  return join(getStateDir(), 'daemon.lock');
}

/**
 * Get the data directory for LevelDB storage.
 */
export function getDataDir(): string {
  return join(getStateDir(), 'data');
}

/**
 * Get the logs directory.
 */
export function getLogsDir(): string {
  return join(getStateDir(), 'logs');
}

/**
 * Get the cache directory.
 */
export function getCacheDir(): string {
  return join(getStateDir(), 'cache');
}

/**
 * Get a task-specific directory.
 */
export function getTaskDir(taskId: string): string {
  return join(getStateDir(), 'tasks', taskId);
}
