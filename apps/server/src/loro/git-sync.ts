/**
 * Git change sync to Loro doc.
 *
 * Watches git for changes and pushes to changeSnapshots[machineId].
 * Replaces polling-based sync with push model.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#git-sync-flow
 */

import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
	MutableTaskDocument,
	SyncedFileChange,
} from "@shipyard/loro-schema";
import { logger } from "../utils/logger.js";

/** Default max file size for untracked files (100KB) */
const DEFAULT_MAX_FILE_SIZE = 100 * 1024;

/** Default polling interval (5 seconds) */
const DEFAULT_POLL_INTERVAL = 5000;

/**
 * Git sync configuration.
 */
export interface GitSyncConfig {
	/** Machine ID for changeSnapshots key */
	machineId: string;
	/** Friendly machine name */
	machineName: string;
	/** Owner ID (GitHub username) */
	ownerId: string;
	/** Working directory to watch */
	cwd: string;
	/** Polling interval in ms (default 5000) */
	pollInterval?: number;
	/** Max file size to include content (default 100KB) */
	maxFileSize?: number;
}

/**
 * File change info from git.
 */
export interface GitFileChange {
	path: string;
	status: "added" | "modified" | "deleted" | "renamed";
	patch: string;
	staged: boolean;
}

/**
 * Result from getGitChanges.
 */
export interface GitChangesResult {
	files: GitFileChange[];
	headSha: string;
	branch: string;
	totalAdditions: number;
	totalDeletions: number;
}

/**
 * Execute a git command and return the output.
 * Uses execFileSync to avoid shell injection vulnerabilities.
 *
 * @param cwd - Working directory
 * @param args - Array of arguments to pass to git
 */
function gitExec(cwd: string, args: string[]): string {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf-8",
			timeout: 10000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

/**
 * Parse git diff --numstat output to count additions/deletions.
 */
function parseNumstat(output: string): {
	additions: number;
	deletions: number;
} {
	let additions = 0;
	let deletions = 0;

	for (const line of output.split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		const add = parts[0] ?? "";
		const del = parts[1] ?? "";
		if (add !== "-") additions += Number.parseInt(add, 10) || 0;
		if (del !== "-") deletions += Number.parseInt(del, 10) || 0;
	}

	return { additions, deletions };
}

/**
 * Read content of untracked file if under size limit.
 * @returns file content or empty string if too large
 */
export async function readUntrackedFile(
	filePath: string,
	maxSize: number,
): Promise<string> {
	try {
		const stats = await stat(filePath);
		if (stats.size > maxSize) {
			return "";
		}
		return await readFile(filePath, "utf-8");
	} catch {
		return "";
	}
}

/**
 * Get current git changes in a directory.
 * Includes staged, unstaged, and untracked files.
 */
export async function getGitChanges(
	cwd: string,
	maxFileSize: number = DEFAULT_MAX_FILE_SIZE,
): Promise<GitChangesResult> {
	const files: GitFileChange[] = [];
	let totalAdditions = 0;
	let totalDeletions = 0;

	const headSha = gitExec(cwd, ["rev-parse", "HEAD"]) || "0000000";

	const branch =
		gitExec(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";

	const stagedDiff = gitExec(cwd, ["diff", "--cached", "--name-status"]);
	const stagedNumstat = gitExec(cwd, ["diff", "--cached", "--numstat"]);
	const stagedStats = parseNumstat(stagedNumstat);
	totalAdditions += stagedStats.additions;
	totalDeletions += stagedStats.deletions;

	for (const line of stagedDiff.split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		const status = parts[0];
		const filePath = parts[1];
		if (!status || !filePath) continue;

		const statusMap: Record<string, SyncedFileChange["status"]> = {
			A: "added",
			M: "modified",
			D: "deleted",
			R: "renamed",
		};

		const patch = gitExec(cwd, ["diff", "--cached", "--", filePath]);
		const statusKey = status[0] ?? "M";
		files.push({
			path: filePath,
			status: statusMap[statusKey] ?? "modified",
			patch,
			staged: true,
		});
	}

	const unstagedDiff = gitExec(cwd, ["diff", "--name-status"]);
	const unstagedNumstat = gitExec(cwd, ["diff", "--numstat"]);
	const unstagedStats = parseNumstat(unstagedNumstat);
	totalAdditions += unstagedStats.additions;
	totalDeletions += unstagedStats.deletions;

	for (const line of unstagedDiff.split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		const status = parts[0];
		const filePath = parts[1];
		if (!status || !filePath) continue;

		if (files.some((f) => f.path === filePath && f.staged)) continue;

		const statusMap: Record<string, SyncedFileChange["status"]> = {
			A: "added",
			M: "modified",
			D: "deleted",
			R: "renamed",
		};

		const patch = gitExec(cwd, ["diff", "--", filePath]);
		const statusKey = status[0] ?? "M";
		files.push({
			path: filePath,
			status: statusMap[statusKey] ?? "modified",
			patch,
			staged: false,
		});
	}

	const untrackedOutput = gitExec(cwd, [
		"ls-files",
		"--others",
		"--exclude-standard",
	]);

	for (const path of untrackedOutput.split("\n")) {
		if (!path) continue;

		const fullPath = join(cwd, path);
		const content = await readUntrackedFile(fullPath, maxFileSize);

		if (content) {
			totalAdditions += content.split("\n").length;
		}

		files.push({
			path,
			status: "added",
			patch: content,
			staged: false,
		});
	}

	return {
		files,
		headSha,
		branch,
		totalAdditions,
		totalDeletions,
	};
}

/**
 * Handle type for task documents.
 */
type TaskDocHandle = {
	change: (fn: (doc: MutableTaskDocument) => void) => void;
};

/**
 * Start git sync for a task document.
 * Pushes changes to changeSnapshots[machineId] periodically.
 */
export function startGitSync(
	handle: TaskDocHandle,
	config: GitSyncConfig,
): () => void {
	const {
		machineId,
		machineName,
		ownerId,
		cwd,
		pollInterval = DEFAULT_POLL_INTERVAL,
		maxFileSize = DEFAULT_MAX_FILE_SIZE,
	} = config;

	let stopped = false;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	logger.info({ machineId, cwd, pollInterval }, "Starting git sync");

	/**
	 * Sync git changes to the document.
	 */
	async function sync(): Promise<void> {
		if (stopped) return;

		try {
			const changes = await getGitChanges(cwd, maxFileSize);

			handle.change((doc) => {
				let snapshot = doc.changeSnapshots.get(machineId);
				if (!snapshot) {
					doc.changeSnapshots.set(machineId, {
						machineId,
						machineName,
						ownerId,
						headSha: changes.headSha,
						branch: changes.branch,
						cwd,
						isLive: true,
						updatedAt: Date.now(),
						files: [],
						totalAdditions: 0,
						totalDeletions: 0,
					});
					snapshot = doc.changeSnapshots.get(machineId);
				}

				snapshot.headSha = changes.headSha;
				snapshot.branch = changes.branch;
				snapshot.isLive = true;
				snapshot.updatedAt = Date.now();
				snapshot.totalAdditions = changes.totalAdditions;
				snapshot.totalDeletions = changes.totalDeletions;

				while (snapshot.files.length > 0) {
					snapshot.files.delete(0);
				}

				for (const file of changes.files) {
					snapshot.files.push({
						path: file.path,
						status: file.status,
						patch: file.patch,
						staged: file.staged,
					});
				}
			});

			logger.debug(
				{ machineId, fileCount: changes.files.length },
				"Git sync completed",
			);
		} catch (error) {
			logger.error({ error, machineId, cwd }, "Git sync failed");
		}

		if (!stopped) {
			timeoutId = setTimeout(sync, pollInterval);
		}
	}

	sync();

	return () => {
		stopped = true;
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}

		try {
			handle.change((doc) => {
				const snapshot = doc.changeSnapshots.get(machineId);
				if (snapshot) {
					snapshot.isLive = false;
					snapshot.updatedAt = Date.now();
				}
			});
		} catch {}

		logger.info({ machineId }, "Git sync stopped");
	};
}
