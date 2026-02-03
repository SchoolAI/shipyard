/**
 * PID-based lock file management for daemon singleton.
 *
 * Ensures only one daemon instance runs at a time per worktree.
 * Uses atomic file creation (wx flag) to prevent race conditions.
 *
 * Ported from apps/daemon-legacy/src/lock-manager.ts
 */

import { mkdirSync, unlinkSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getLockFilePath, getStateDir } from "./paths.js";

const MAX_LOCK_RETRIES = 3;

/**
 * Check if an error has a specific code.
 */
function hasErrorCode(error: unknown, code: string): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return false;
	}
	// eslint-disable-next-line no-restricted-syntax
	const errorWithCode = error as { code: string };
	return errorWithCode.code === code;
}

/**
 * Read the PID from the lock file.
 */
async function readLockHolderPid(): Promise<number | null> {
	try {
		const content = await readFile(getLockFilePath(), "utf-8");
		const pidStr = content.split("\n")[0] ?? "";
		return Number.parseInt(pidStr, 10);
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
 * Register a cleanup handler to remove lock on process exit.
 */
function registerLockCleanupHandler(): void {
	const lockFile = getLockFilePath();
	process.once("exit", () => {
		try {
			unlinkSync(lockFile);
		} catch {
			/** Lock may already be cleaned up */
		}
	});
}

/**
 * Handle an existing lock file - check if holder is alive.
 */
async function handleExistingLock(retryCount: number): Promise<boolean> {
	const pid = await readLockHolderPid();
	if (pid === null) return false;

	if (isProcessAlive(pid)) {
		return false;
	}

	if (retryCount >= MAX_LOCK_RETRIES) {
		return false;
	}

	await tryRemoveStaleLock(pid);
	return tryAcquireLock(retryCount + 1);
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

		await writeFile(lockFile, `${process.pid}\n${Date.now()}`, { flag: "wx" });

		registerLockCleanupHandler();

		return true;
	} catch (err) {
		if (hasErrorCode(err, "EEXIST")) {
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
		const { readFileSync, existsSync } = require("node:fs");
		const lockPath = getLockFilePath();

		if (!existsSync(lockPath)) return false;

		const content = readFileSync(lockPath, "utf-8");
		const pidStr = content.split("\n")[0] ?? "";
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
	const { existsSync, readFileSync, writeFileSync } = require("node:fs");
	const lockPath = getLockFilePath();

	if (existsSync(lockPath)) {
		try {
			const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
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
		writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		registerLockCleanupHandler();
		return true;
	} catch {
		return false;
	}
}
