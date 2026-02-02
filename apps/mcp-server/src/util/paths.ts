/**
 * State directory paths.
 *
 * Helpers for locating Shipyard state directories.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Base directory for Shipyard state */
const SHIPYARD_DIR = ".shipyard";

/**
 * Get the Shipyard base directory.
 */
export function getShipyardDir(): string {
	return join(homedir(), SHIPYARD_DIR);
}

/**
 * Get the data directory for LevelDB storage.
 */
export function getDataDir(): string {
	return join(getShipyardDir(), "data");
}

/**
 * Get the logs directory.
 */
export function getLogsDir(): string {
	return join(getShipyardDir(), "logs");
}

/**
 * Get the cache directory.
 */
export function getCacheDir(): string {
	return join(getShipyardDir(), "cache");
}

/**
 * Get a task-specific directory.
 */
export function getTaskDir(taskId: string): string {
	return join(getShipyardDir(), "tasks", taskId);
}
