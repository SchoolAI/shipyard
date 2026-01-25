/**
 * Git local changes helper - runs git commands to get working tree diff.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import type { GitFileStatus, LocalChangesResult, LocalFileChange } from '@shipyard/schema';
import { logger } from './logger.js';

/**
 * Get local git changes from a working directory.
 * Runs git status and git diff commands to build a structured response.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git parsing with auto-init, branch detection, diff parsing requires branching
export function getLocalChanges(cwd: string): LocalChangesResult {
  try {
    // Verify it's a git repository, auto-initialize if not
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // Not a git repo - auto-initialize
      logger.info({ cwd }, 'Not a git repo, initializing with git init');
      try {
        execSync('git init', {
          cwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        logger.info({ cwd }, 'Git repository initialized');
        // Continue with normal flow - the repo is now initialized
      } catch (initError) {
        const message = initError instanceof Error ? initError.message : 'Unknown error';
        logger.error({ error: initError, cwd }, 'Failed to initialize git repository');
        return {
          available: false,
          reason: 'git_error',
          message: `Failed to initialize git repository: ${message}`,
        };
      }
    }

    // Get current branch (or commit SHA if detached HEAD)
    let branch: string;
    let headSha: string | undefined;
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      // Get HEAD SHA for staleness detection in comments
      try {
        headSha = execSync('git rev-parse HEAD', {
          cwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        // No commits yet
        headSha = undefined;
      }

      // If detached HEAD, get short commit SHA
      if (branch === 'HEAD') {
        branch = execSync('git rev-parse --short HEAD', {
          cwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      }
    } catch (error) {
      logger.warn({ error, cwd }, 'Could not get current branch');
      branch = 'unknown';
    }

    // Get status (staged, unstaged, untracked)
    const statusOutput = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const { staged, unstaged, untracked } = parseGitStatus(statusOutput);

    // Get diff with stats for all changes (staged + unstaged vs HEAD)
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff HEAD', {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      // diff HEAD fails if no commits yet, try diff --cached instead
      logger.debug({ error, cwd }, 'git diff HEAD failed, trying alternatives');
      try {
        diffOutput = execSync('git diff --cached', {
          cwd,
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // No diff available
        diffOutput = '';
      }
    }

    // Parse diff into file changes
    const files = parseDiffOutput(diffOutput);

    // Merge status info into files (for files that have no diff, e.g. binary)
    const allPaths = new Set([
      ...staged.map((f) => f.path),
      ...unstaged.map((f) => f.path),
      ...files.map((f) => f.path),
    ]);

    const mergedFiles: LocalFileChange[] = [];
    for (const path of allPaths) {
      const diffFile = files.find((f) => f.path === path);
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

    // Sort files alphabetically
    mergedFiles.sort((a, b) => a.path.localeCompare(b.path));

    logger.debug(
      {
        cwd,
        branch,
        headSha,
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
      headSha,
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

    const x = line[0]; // Staged status
    const y = line[1]; // Unstaged status
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
        additions: 0, // We get this from diff output
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
      return 'modified'; // Unmerged, treat as modified
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
