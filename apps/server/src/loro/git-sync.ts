/**
 * Git change sync to Loro doc.
 *
 * Watches git for changes and pushes to changeSnapshots[machineId].
 * Replaces polling-based sync with push model.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#git-sync-flow
 */

import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MutableTaskDocument, SyncedFileChange } from '@shipyard/loro-schema';
import { logger } from '../utils/logger.js';

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
  status: 'added' | 'modified' | 'deleted' | 'renamed';
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
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
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

  for (const line of output.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    const add = parts[0] ?? '';
    const del = parts[1] ?? '';
    if (add !== '-') additions += Number.parseInt(add, 10) || 0;
    if (del !== '-') deletions += Number.parseInt(del, 10) || 0;
  }

  return { additions, deletions };
}

/** Map git status codes to SyncedFileChange status */
const GIT_STATUS_MAP: Record<string, SyncedFileChange['status']> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
};

/**
 * Parse a single line from git diff --name-status output.
 * @returns Parsed status and path, or null if invalid
 */
function parseNameStatusLine(line: string): { status: string; path: string } | null {
  if (!line) return null;
  const parts = line.split('\t');
  const status = parts[0];
  const path = parts[1];
  if (!status || !path) return null;
  return { status, path };
}

/**
 * Create a GitFileChange from parsed git output.
 */
function createFileChange(
  cwd: string,
  path: string,
  statusCode: string,
  staged: boolean,
  diffArgs: string[]
): GitFileChange {
  const patch = gitExec(cwd, diffArgs);
  const statusKey = statusCode[0] ?? 'M';
  return {
    path,
    status: GIT_STATUS_MAP[statusKey] ?? 'modified',
    patch,
    staged,
  };
}

/**
 * Process staged files from git diff output.
 */
function processStagedFiles(cwd: string, stagedDiff: string): GitFileChange[] {
  const files: GitFileChange[] = [];

  for (const line of stagedDiff.split('\n')) {
    const parsed = parseNameStatusLine(line);
    if (!parsed) continue;

    files.push(
      createFileChange(cwd, parsed.path, parsed.status, true, [
        'diff',
        '--cached',
        '--',
        parsed.path,
      ])
    );
  }

  return files;
}

/**
 * Process unstaged files from git diff output.
 * Skips files that are already staged.
 */
function processUnstagedFiles(
  cwd: string,
  unstagedDiff: string,
  stagedPaths: Set<string>
): GitFileChange[] {
  const files: GitFileChange[] = [];

  for (const line of unstagedDiff.split('\n')) {
    const parsed = parseNameStatusLine(line);
    if (!parsed) continue;
    if (stagedPaths.has(parsed.path)) continue;

    files.push(
      createFileChange(cwd, parsed.path, parsed.status, false, ['diff', '--', parsed.path])
    );
  }

  return files;
}

/**
 * Process untracked files.
 */
async function processUntrackedFiles(
  cwd: string,
  untrackedOutput: string,
  maxFileSize: number
): Promise<{ files: GitFileChange[]; additions: number }> {
  const files: GitFileChange[] = [];
  let additions = 0;

  for (const path of untrackedOutput.split('\n')) {
    if (!path) continue;

    const fullPath = join(cwd, path);
    const content = await readUntrackedFile(fullPath, maxFileSize);

    if (content) {
      additions += content.split('\n').length;
    }

    files.push({
      path,
      status: 'added',
      patch: content,
      staged: false,
    });
  }

  return { files, additions };
}

/**
 * Read content of untracked file if under size limit.
 * @returns file content or empty string if too large
 */
export async function readUntrackedFile(filePath: string, maxSize: number): Promise<string> {
  try {
    const stats = await stat(filePath);
    if (stats.size > maxSize) {
      return '';
    }
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Get current git changes in a directory.
 * Includes staged, unstaged, and untracked files.
 */
export async function getGitChanges(
  cwd: string,
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE
): Promise<GitChangesResult> {
  const headSha = gitExec(cwd, ['rev-parse', 'HEAD']) || '0000000';
  const branch = gitExec(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';

  // Process staged files
  const stagedDiff = gitExec(cwd, ['diff', '--cached', '--name-status']);
  const stagedStats = parseNumstat(gitExec(cwd, ['diff', '--cached', '--numstat']));
  const stagedFiles = processStagedFiles(cwd, stagedDiff);
  const stagedPaths = new Set(stagedFiles.map((f) => f.path));

  // Process unstaged files (skip already staged)
  const unstagedDiff = gitExec(cwd, ['diff', '--name-status']);
  const unstagedStats = parseNumstat(gitExec(cwd, ['diff', '--numstat']));
  const unstagedFiles = processUnstagedFiles(cwd, unstagedDiff, stagedPaths);

  // Process untracked files
  const untrackedOutput = gitExec(cwd, ['ls-files', '--others', '--exclude-standard']);
  const untracked = await processUntrackedFiles(cwd, untrackedOutput, maxFileSize);

  return {
    files: [...stagedFiles, ...unstagedFiles, ...untracked.files],
    headSha,
    branch,
    totalAdditions: stagedStats.additions + unstagedStats.additions + untracked.additions,
    totalDeletions: stagedStats.deletions + unstagedStats.deletions,
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
export function startGitSync(handle: TaskDocHandle, config: GitSyncConfig): () => void {
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

  logger.info({ machineId, cwd, pollInterval }, 'Starting git sync');

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
          if (!snapshot) {
            throw new Error('Failed to create change snapshot');
          }
        }

        snapshot.headSha = changes.headSha;
        snapshot.branch = changes.branch;
        snapshot.isLive = true;
        snapshot.updatedAt = Date.now();
        snapshot.totalAdditions = changes.totalAdditions;
        snapshot.totalDeletions = changes.totalDeletions;

        while (snapshot.files.length > 0) {
          snapshot.files.delete(0, 1);
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

      logger.debug({ machineId, fileCount: changes.files.length }, 'Git sync completed');
    } catch (error) {
      logger.error({ error, machineId, cwd }, 'Git sync failed');
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

    logger.info({ machineId }, 'Git sync stopped');
  };
}
