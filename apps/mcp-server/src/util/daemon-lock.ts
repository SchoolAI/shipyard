/**
 * Daemon singleton lock.
 *
 * Ensures only one daemon instance runs per machine.
 * Ported from apps/daemon-legacy/src/lock-manager.ts.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_FILE_NAME = "shipyard-daemon.lock";

/**
 * Get the lock file path.
 */
function getLockPath(): string {
	return join(tmpdir(), LOCK_FILE_NAME);
}

/**
 * Acquire the daemon lock.
 * @returns true if lock acquired, false if another daemon is running
 */
export function acquireLock(): boolean {
	const lockPath = getLockPath();

	if (existsSync(lockPath)) {
		// Check if process is still running
		try {
			const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
			if (!Number.isNaN(pid)) {
				try {
					// Check if process exists (signal 0 doesn't kill, just checks)
					process.kill(pid, 0);
					// Process exists, lock is held
					return false;
				} catch {
					// Process doesn't exist, stale lock
					unlinkSync(lockPath);
				}
			}
		} catch {
			// Can't read lock file, try to acquire
		}
	}

	// Write our PID to lock file
	try {
		writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return true;
	} catch {
		// Another process beat us
		return false;
	}
}

/**
 * Release the daemon lock.
 */
export function releaseLock(): void {
	const lockPath = getLockPath();
	try {
		if (existsSync(lockPath)) {
			const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
			if (pid === process.pid) {
				unlinkSync(lockPath);
			}
		}
	} catch {
		// Ignore errors during cleanup
	}
}

/**
 * Check if the daemon is running (lock is held).
 */
export function isLocked(): boolean {
	const lockPath = getLockPath();
	if (!existsSync(lockPath)) return false;

	try {
		const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
		if (Number.isNaN(pid)) return false;
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
