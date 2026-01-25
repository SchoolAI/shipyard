/**
 * Git local changes helper - runs git commands to get working tree diff.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import type { GitFileStatus, LocalChangesResult, LocalFileChange } from '@shipyard/schema';
import { logger } from './logger.js';

// --- Git Command Helpers ---

interface GitExecOptions {
  cwd: string;
  timeout?: number;
  maxBuffer?: number;
}

/**
 * Execute a git command and return trimmed output.
 * Returns null if command fails.
 */
function execGit(command: string, opts: GitExecOptions): string | null {
  try {
    return execSync(command, {
      cwd: opts.cwd,
      encoding: 'utf-8',
      timeout: opts.timeout ?? 5000,
      maxBuffer: opts.maxBuffer,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Ensure the directory is a git repository, initializing if needed.
 * Returns error result if initialization fails.
 */
function ensureGitRepo(cwd: string): LocalChangesResult | null {
  const isRepo = execGit('git rev-parse --is-inside-work-tree', { cwd });
  if (isRepo !== null) return null;

  // Not a git repo - auto-initialize
  logger.info({ cwd }, 'Not a git repo, initializing with git init');
  const initResult = execGit('git init', { cwd });

  if (initResult === null) {
    logger.error({ cwd }, 'Failed to initialize git repository');
    return {
      available: false,
      reason: 'git_error',
      message: 'Failed to initialize git repository',
    };
  }

  logger.info({ cwd }, 'Git repository initialized');
  return null;
}

/**
 * Get the current branch name, falling back to short SHA for detached HEAD.
 */
function getCurrentBranchName(cwd: string): string {
  const branch = execGit('git rev-parse --abbrev-ref HEAD', { cwd });

  if (!branch) {
    logger.warn({ cwd }, 'Could not get current branch');
    return 'unknown';
  }

  // If detached HEAD, get short commit SHA
  if (branch === 'HEAD') {
    return execGit('git rev-parse --short HEAD', { cwd }) ?? 'unknown';
  }

  return branch;
}

/**
 * Get git diff output, trying HEAD first then falling back to --cached.
 */
function getGitDiff(cwd: string): string {
  const headDiff = execGit('git diff HEAD', { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
  if (headDiff !== null) return headDiff;

  // diff HEAD fails if no commits yet, try diff --cached instead
  logger.debug({ cwd }, 'git diff HEAD failed, trying --cached');
  return execGit('git diff --cached', { cwd, timeout: 30000, maxBuffer: 10 * 1024 * 1024 }) ?? '';
}

/**
 * Merge file status with diff information.
 */
function mergeFilesWithStatus(
  staged: LocalFileChange[],
  unstaged: LocalFileChange[],
  diffFiles: LocalFileChange[]
): LocalFileChange[] {
  const allPaths = new Set([
    ...staged.map((f) => f.path),
    ...unstaged.map((f) => f.path),
    ...diffFiles.map((f) => f.path),
  ]);

  const mergedFiles: LocalFileChange[] = [];
  for (const path of allPaths) {
    const diffFile = diffFiles.find((f) => f.path === path);
    const stagedFile = staged.find((f) => f.path === path);
    const unstagedFile = unstaged.find((f) => f.path === path);

    if (diffFile) {
      mergedFiles.push(diffFile);
    } else {
      // File has status but no diff (binary, or other edge case)
      const status = stagedFile?.status ?? unstagedFile?.status ?? 'modified';
      mergedFiles.push({
        path,
        status,
        additions: 0,
        deletions: 0,
        patch: undefined,
      });
    }
  }

  return mergedFiles.sort((a, b) => a.path.localeCompare(b.path));
}

// --- Main Function ---

/**
 * Get local git changes from a working directory.
 * Runs git status and git diff commands to build a structured response.
 */
export function getLocalChanges(cwd: string): LocalChangesResult {
  try {
    // Ensure git repo exists (auto-init if needed)
    const repoError = ensureGitRepo(cwd);
    if (repoError) return repoError;

    // Get current branch
    const branch = getCurrentBranchName(cwd);

    // Get status (staged, unstaged, untracked)
    const statusOutput = execGit('git status --porcelain', { cwd, timeout: 10000 }) ?? '';
    const { staged, unstaged, untracked } = parseGitStatus(statusOutput);

    // Get diff and parse into file changes
    const diffOutput = getGitDiff(cwd);
    const diffFiles = parseDiffOutput(diffOutput);

    // Merge status info into files
    const mergedFiles = mergeFilesWithStatus(staged, unstaged, diffFiles);

    logger.debug(
      {
        cwd,
        branch,
        stagedCount: staged.length,
        unstagedCount: unstaged.length,
        untrackedCount: untracked.length,
        filesCount: mergedFiles.length,
      },
      'Got local changes'
    );

    return {
      available: true,
      branch,
      baseBranch: 'HEAD',
      staged,
      unstaged,
      untracked,
      files: mergedFiles,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, cwd }, 'Failed to get local changes');

    return {
      available: false,
      reason: 'git_error',
      message: `Git error: ${message}`,
    };
  }
}

/**
 * Parse git status --porcelain output into staged/unstaged/untracked.
 *
 * Format: XY filename
 * X = staged status, Y = unstaged status
 * ?? = untracked
 * !! = ignored
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git status parsing requires many conditional branches
function parseGitStatus(output: string): {
  staged: LocalFileChange[];
  unstaged: LocalFileChange[];
  untracked: string[];
} {
  const staged: LocalFileChange[] = [];
  const unstaged: LocalFileChange[] = [];
  const untracked: string[] = [];

  for (const line of output.split('\n')) {
    if (!line || line.length < 3) continue;

    const x = line[0];
    const y = line[1];
    let path = line.slice(3);

    // Handle renamed files: "R  old -> new"
    if (path.includes(' -> ')) {
      path = path.split(' -> ')[1] ?? path;
    }

    // Untracked files
    if (x === '?' && y === '?') {
      untracked.push(path);
      continue;
    }

    // Ignored files - skip
    if (x === '!' && y === '!') {
      continue;
    }

    // Staged changes
    if (x && x !== ' ' && x !== '?') {
      staged.push({
        path,
        status: parseStatusChar(x),
        additions: 0,
        deletions: 0,
      });
    }

    // Unstaged changes
    if (y && y !== ' ' && y !== '?') {
      unstaged.push({
        path,
        status: parseStatusChar(y),
        additions: 0,
        deletions: 0,
      });
    }
  }

  return { staged, unstaged, untracked };
}

/**
 * Convert git status character to our status type.
 */
function parseStatusChar(char: string): GitFileStatus {
  switch (char) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
      return 'modified';
    default:
      return 'modified';
  }
}

/**
 * Parse unified diff output into file changes with patches.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Diff parsing requires many conditional branches
function parseDiffOutput(diff: string): LocalFileChange[] {
  const files: LocalFileChange[] = [];

  if (!diff.trim()) {
    return files;
  }

  // Split by file boundary: "diff --git a/... b/..."
  const fileDiffs = diff.split(/(?=diff --git )/);

  for (const fileDiff of fileDiffs) {
    if (!fileDiff.trim()) continue;

    // Extract filename from "diff --git a/path b/path"
    const headerMatch = fileDiff.match(/^diff --git a\/(.+?) b\/(.+)/m);
    if (!headerMatch) continue;

    const path = headerMatch[2] ?? headerMatch[1];
    if (!path) continue;

    // Check if binary file
    if (fileDiff.includes('Binary files')) {
      files.push({
        path,
        status: detectStatus(fileDiff),
        additions: 0,
        deletions: 0,
        patch: undefined,
      });
      continue;
    }

    // Count additions and deletions
    let additions = 0;
    let deletions = 0;

    for (const line of fileDiff.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    // Extract the patch (everything after the header)
    const patchStart = fileDiff.indexOf('@@');
    const patch = patchStart >= 0 ? fileDiff.slice(patchStart) : undefined;

    files.push({
      path,
      status: detectStatus(fileDiff),
      additions,
      deletions,
      patch,
    });
  }

  return files;
}

/**
 * Detect file status from diff header.
 */
function detectStatus(fileDiff: string): GitFileStatus {
  if (fileDiff.includes('new file mode')) {
    return 'added';
  }
  if (fileDiff.includes('deleted file mode')) {
    return 'deleted';
  }
  if (fileDiff.includes('rename from')) {
    return 'renamed';
  }
  if (fileDiff.includes('copy from')) {
    return 'copied';
  }
  return 'modified';
}

/**
 * Get content of a file from a working directory.
 * Validates the path is within the working directory (no directory traversal).
 */
export function getFileContent(
  cwd: string,
  filePath: string
): { content: string | null; error?: string } {
  try {
    // Prevent directory traversal attacks
    const normalizedPath = normalize(filePath);
    if (isAbsolute(normalizedPath) || normalizedPath.startsWith('..')) {
      return { content: null, error: 'Invalid file path' };
    }

    const fullPath = join(cwd, normalizedPath);

    // Double-check the resolved path is within cwd
    if (!fullPath.startsWith(cwd)) {
      return { content: null, error: 'Invalid file path' };
    }

    const content = readFileSync(fullPath, { encoding: 'utf-8' });

    // Limit content size to prevent memory issues (10MB)
    if (content.length > 10 * 1024 * 1024) {
      return { content: null, error: 'File too large to display' };
    }

    return { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('ENOENT')) {
      return { content: null, error: 'File not found' };
    }
    if (message.includes('EISDIR')) {
      return { content: null, error: 'Path is a directory' };
    }
    return { content: null, error: `Failed to read file: ${message}` };
  }
}
