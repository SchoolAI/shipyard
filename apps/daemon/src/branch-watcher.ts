import { type FSWatcher, watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { GitRepoInfo } from '@shipyard/session';
import { getRepoMetadata } from './capabilities.js';
import { logger } from './logger.js';

const DEBOUNCE_MS = 500;

export interface BranchWatcherOptions {
  environments: GitRepoInfo[];
  onUpdate: (updated: GitRepoInfo[]) => void;
}

/**
 * Watch `.git/HEAD` for each discovered git repo and call `onUpdate`
 * whenever a branch changes (checkout, rebase, switch, etc.).
 *
 * Returns a handle with a `close()` method that tears down all watchers.
 */
export interface BranchWatcher {
  close: () => void;
  addEnvironment: (repoPath: string, branch: string) => void;
}

/**
 * Resolve the path to the HEAD file for a git repo.
 *
 * Regular repos have `.git/` as a directory, so HEAD is at `.git/HEAD`.
 * Worktrees have `.git` as a file containing `gitdir: <path>`, pointing
 * to the actual git dir (e.g. `<main-repo>/.git/worktrees/<name>/`).
 */
async function resolveHeadPath(repoPath: string): Promise<string> {
  const gitPath = join(repoPath, '.git');
  const gitStat = await stat(gitPath);

  if (gitStat.isDirectory()) {
    return join(gitPath, 'HEAD');
  }

  const content = await readFile(gitPath, 'utf-8');
  const match = content.trim().match(/^gitdir:\s*(.+)$/);
  if (!match?.[1]) {
    throw new Error(`Invalid .git file at ${gitPath}`);
  }

  const gitDir = match[1];
  const resolvedGitDir = isAbsolute(gitDir) ? gitDir : join(repoPath, gitDir);
  return join(resolvedGitDir, 'HEAD');
}

export function createBranchWatcher(options: BranchWatcherOptions): BranchWatcher {
  const log = logger.child({ component: 'branch-watcher' });
  const watchers = new Map<string, FSWatcher>();
  const branches = new Map<string, string>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let environments = [...options.environments];

  for (const env of environments) {
    branches.set(env.path, env.branch);
    void startWatching(env.path);
  }

  log.info({ count: environments.length }, 'Branch watcher started');

  async function startWatching(repoPath: string): Promise<void> {
    let headPath: string;
    try {
      headPath = await resolveHeadPath(repoPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.debug({ repoPath, err: msg }, 'Failed to resolve HEAD path, skipping watch');
      return;
    }

    try {
      const watcher = watch(headPath, () => {
        debouncedCheck(repoPath);
      });

      watcher.on('error', (err) => {
        log.debug({ repoPath, err: err.message }, 'Watcher error, removing');
        removeWatcher(repoPath);
      });

      watchers.set(repoPath, watcher);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.debug({ repoPath, err: msg }, 'Failed to watch HEAD');
    }
  }

  function removeWatcher(repoPath: string): void {
    const watcher = watchers.get(repoPath);
    if (watcher) {
      watcher.close();
      watchers.delete(repoPath);
    }
    const timer = debounceTimers.get(repoPath);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(repoPath);
    }
  }

  function debouncedCheck(repoPath: string): void {
    const existing = debounceTimers.get(repoPath);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      repoPath,
      setTimeout(() => {
        debounceTimers.delete(repoPath);
        checkBranch(repoPath);
      }, DEBOUNCE_MS)
    );
  }

  function checkBranch(repoPath: string): void {
    getRepoMetadata(repoPath)
      .then((metadata) => {
        if (!metadata) {
          log.debug({ repoPath }, 'Repo no longer accessible, removing watcher');
          removeWatcher(repoPath);
          environments = environments.filter((e) => e.path !== repoPath);
          options.onUpdate(environments);
          return;
        }

        const previousBranch = branches.get(repoPath);
        if (metadata.branch === previousBranch) {
          return;
        }

        log.info({ repoPath, from: previousBranch, to: metadata.branch }, 'Branch changed');

        branches.set(repoPath, metadata.branch);
        environments = environments.map((e) => (e.path === repoPath ? metadata : e));
        options.onUpdate(environments);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.debug({ repoPath, err: msg }, 'Failed to check branch');
      });
  }

  return {
    close() {
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();

      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();

      log.info('Branch watcher closed');
    },

    addEnvironment(repoPath: string, branch: string) {
      if (watchers.has(repoPath)) {
        log.debug({ repoPath }, 'Already watching, skipping addEnvironment');
        return;
      }

      branches.set(repoPath, branch);
      environments.push({
        path: repoPath,
        name: repoPath.split('/').pop() ?? repoPath,
        branch,
        remote: undefined,
      });
      void startWatching(repoPath);
      log.info({ repoPath, branch }, 'Added environment to branch watcher');
    },
  };
}
