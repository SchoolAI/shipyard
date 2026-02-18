import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { access, chmod, constants, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { BRANCH_NAME_PATTERN } from '@shipyard/session';

const GIT_TIMEOUT_MS = 30_000;

interface WorktreeCreateOptions {
  sourceRepoPath: string;
  branchName: string;
  baseRef: string;
  setupScript: string | null;
  onProgress: (step: string, detail?: string) => void;
}

export interface WorktreeCreateResult {
  worktreePath: string;
  branchName: string;
  setupScriptStarted: boolean;
  setupChild: ChildProcess | null;
  warnings: string[];
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

const MAX_BUFFER = 10 * 1024 * 1024;

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { timeout: GIT_TIMEOUT_MS, cwd, maxBuffer: MAX_BUFFER },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      }
    );
  });
}

/**
 * Patterns to exclude when copying ignored files from source to worktree.
 * These are build artifacts and OS junk that should never be copied.
 */
const COPY_EXCLUDE_PATTERNS = [
  'node_modules',
  '.turbo',
  '.data/',
  '/dist/',
  '/build/',
  '.next',
  '.DS_Store',
  '*.log',
  '.eslintcache',
];

function matchesPattern(filePath: string, pattern: string): boolean {
  const segments = filePath.split('/');
  if (pattern.startsWith('*')) return filePath.endsWith(pattern.slice(1));

  /** Strip leading/trailing slashes to get the bare directory name for segment matching */
  let bare = pattern;
  if (bare.startsWith('/')) bare = bare.slice(1);
  if (bare.endsWith('/')) bare = bare.slice(0, -1);

  return segments.some((seg) => seg === bare);
}

function shouldExclude(filePath: string): boolean {
  return COPY_EXCLUDE_PATTERNS.some((pattern) => matchesPattern(filePath, pattern));
}

/** Check whether the given ref exists. Returns true if rev-parse succeeds. */
async function refExists(ref: string, cwd: string): Promise<boolean> {
  try {
    await runGit(['rev-parse', '--verify', ref], cwd);
    return true;
  } catch {
    return false;
  }
}

/** Ensure the target path does not already exist. */
async function assertWorktreeNotExists(worktreePath: string): Promise<void> {
  try {
    await access(worktreePath, constants.F_OK);
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') return;
    /** Non-ENOENT errors: treat as non-existent; git worktree add will fail if there is a real issue */
    return;
  }
  throw new Error(`Worktree already exists at ${worktreePath}`);
}

/** Run `git worktree add` with the correct arguments based on branch existence. */
async function addWorktree(
  worktreePath: string,
  branchName: string,
  baseRef: string,
  cwd: string
): Promise<void> {
  const remoteExists = await refExists(`origin/${branchName}`, cwd);
  if (remoteExists) {
    try {
      await runGit(['worktree', 'add', worktreePath, branchName], cwd);
      return;
    } catch {
      await runGit(
        ['worktree', 'add', worktreePath, '-b', branchName, `origin/${branchName}`],
        cwd
      );
      return;
    }
  }

  const localExists = await refExists(branchName, cwd);
  if (localExists) {
    await runGit(['worktree', 'add', worktreePath, branchName], cwd);
    return;
  }

  const normalizedRef = baseRef.startsWith('origin/') ? baseRef.slice('origin/'.length) : baseRef;
  await runGit(['worktree', 'add', worktreePath, '-b', branchName, `origin/${normalizedRef}`], cwd);
}

/** Copy ignored-but-needed files (e.g. .env) from source repo to worktree. */
async function copyIgnoredFiles(sourceRepoPath: string, worktreePath: string): Promise<string[]> {
  const warnings: string[] = [];

  const ignoredOutput = await runGit(
    ['ls-files', '--others', '--ignored', '--exclude-standard'],
    sourceRepoPath
  );
  if (!ignoredOutput) return warnings;

  const files = ignoredOutput.split('\n').filter((f) => f && !shouldExclude(f));

  for (const file of files) {
    try {
      const destPath = join(worktreePath, file);
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(join(sourceRepoPath, file), destPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to copy ${file}: ${msg}`);
    }
  }

  return warnings;
}

/**
 * Launch a setup script in the worktree directory.
 *
 * 1. Writes the script to `<worktreePath>/.shipyard/worktree-setup.sh`
 * 2. Makes it executable
 * 3. Spawns it detached with stdout/stderr redirected to `worktree-setup.log`
 *
 * Returns the ChildProcess if the script was started, null if skipped.
 * The caller is responsible for monitoring the child's exit event and
 * writing terminal status to the CRDT document.
 * The process is kept detached so it survives if the daemon exits unexpectedly.
 */
async function launchSetupScript(
  worktreePath: string,
  setupScript: string | null
): Promise<ChildProcess | null> {
  if (!setupScript) return null;

  const shipyardDir = join(worktreePath, '.shipyard');
  const scriptPath = join(shipyardDir, 'worktree-setup.sh');
  const logPath = join(shipyardDir, 'worktree-setup.log');

  /** Prepend shebang + set -e so the OS knows the interpreter and failures abort early */
  let fullScript: string;
  if (setupScript.startsWith('#!')) {
    const firstNewline = setupScript.indexOf('\n');
    const shebang = setupScript.slice(0, firstNewline + 1);
    const rest = setupScript.slice(firstNewline + 1);
    fullScript = `${shebang}set -e\n${rest}`;
  } else {
    fullScript = `#!/bin/sh\nset -e\n${setupScript}`;
  }

  await mkdir(shipyardDir, { recursive: true });
  await writeFile(scriptPath, fullScript, 'utf-8');
  await chmod(scriptPath, 0o755);

  const logFd = openSync(logPath, 'w');

  try {
    const child = spawn(scriptPath, [], {
      cwd: worktreePath,
      stdio: ['ignore', logFd, logFd],
      detached: true,
    });

    return child;
  } finally {
    closeSync(logFd);
  }
}

/**
 * Create a git worktree using the "sandwich" pattern:
 *
 * 1. Create the worktree (git worktree add)
 * 2. Copy ignored-but-needed files from source (e.g. .env, build caches)
 * 3. Optionally launch a per-repo setup script
 *
 * The worktree is placed at `<sourceRepoPath>-wt/<branchName>`.
 */
export async function createWorktree(opts: WorktreeCreateOptions): Promise<WorktreeCreateResult> {
  const { sourceRepoPath, branchName, baseRef, setupScript, onProgress } = opts;

  validateWorktreeInputs(sourceRepoPath, branchName, baseRef);

  const worktreeParent = `${sourceRepoPath}-wt`;
  const worktreePath = join(worktreeParent, branchName);

  onProgress('creating-worktree', `Creating worktree at ${worktreePath}`);
  await mkdir(worktreeParent, { recursive: true });
  await assertWorktreeNotExists(worktreePath);

  /** Non-fatal: the ref may already be local */
  try {
    await runGit(['fetch', 'origin', baseRef], sourceRepoPath);
  } catch {}

  await addWorktree(worktreePath, branchName, baseRef, sourceRepoPath);

  onProgress('copying-files', 'Copying ignored files from source repo');
  let warnings: string[] = [];
  try {
    warnings = await copyIgnoredFiles(sourceRepoPath, worktreePath);
    onProgress('copying-files', `Copied ignored files (${warnings.length} warnings)`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Failed to list ignored files: ${msg}`);
  }

  const setupChild = await launchSetupScript(worktreePath, setupScript);
  const setupScriptStarted = setupChild !== null;
  if (setupScriptStarted) {
    onProgress('running-setup-script', 'Launched worktree setup script');
  }

  return { worktreePath, branchName, setupScriptStarted, setupChild, warnings };
}

/** Pattern for valid git ref names (branch names, tags, etc.) */
const BASE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

function validateWorktreeInputs(sourceRepoPath: string, branchName: string, baseRef: string): void {
  if (!isAbsolute(sourceRepoPath)) {
    throw new Error(`sourceRepoPath must be an absolute path, got: ${sourceRepoPath}`);
  }
  if (sourceRepoPath.includes('..')) {
    throw new Error('sourceRepoPath must not contain ".." path traversal segments');
  }
  if (branchName.includes('..')) {
    throw new Error('branchName must not contain ".." path traversal segments');
  }
  if (branchName.startsWith('-') || branchName.startsWith('.')) {
    throw new Error('branchName must not start with "-" or "."');
  }
  if (!BRANCH_NAME_PATTERN.test(branchName)) {
    throw new Error(
      `branchName contains invalid characters. Must match ${BRANCH_NAME_PATTERN.source}`
    );
  }
  if (baseRef.startsWith('-')) {
    throw new Error('baseRef must not start with "-"');
  }
  if (baseRef.includes('..')) {
    throw new Error('baseRef must not contain ".." path traversal segments');
  }
  if (!BASE_REF_PATTERN.test(baseRef)) {
    throw new Error(`baseRef contains invalid characters. Must match ${BASE_REF_PATTERN.source}`);
  }
}
