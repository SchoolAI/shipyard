/**
 * Git change sync to Loro doc.
 *
 * Watches git for changes and pushes to changeSnapshots[machineId].
 * Replaces polling-based sync with push model.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#git-sync-flow
 */

// TODO: Import from @shipyard/loro-schema
// import type { ChangeSnapshot } from '@shipyard/loro-schema'

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
	/** Polling interval in ms (if not using file watcher) */
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
 * Get current git changes in a directory.
 * Includes staged, unstaged, and untracked files.
 */
export async function getGitChanges(_cwd: string): Promise<{
	files: GitFileChange[];
	headSha: string;
	branch: string;
	totalAdditions: number;
	totalDeletions: number;
}> {
	// TODO: Implement using child_process git commands
	// git diff --cached (staged)
	// git diff (unstaged)
	// git ls-files --others --exclude-standard (untracked)
	throw new Error("Not implemented");
}

/**
 * Start git sync for a task document.
 * Pushes changes to changeSnapshots[machineId] periodically or on file change.
 */
export function startGitSync(
	_docId: string,
	_config: GitSyncConfig,
): () => void {
	// TODO: Implement git sync
	// Option 1: File watcher (chokidar)
	// Option 2: Periodic polling
	// On change: get git changes, write to doc.changeSnapshots[machineId]
	throw new Error("Not implemented");
}

/**
 * Read content of untracked file if under size limit.
 * @returns file content or empty string if too large
 */
export async function readUntrackedFile(
	_filePath: string,
	_maxSize: number,
): Promise<string> {
	// TODO: Implement
	// if (stat.size > maxSize) return ''
	// return fs.readFile(filePath, 'utf-8')
	throw new Error("Not implemented");
}
