import { type FSWatcher, watch } from 'node:fs';
import { join } from 'node:path';
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
export function createBranchWatcher(options: BranchWatcherOptions): { close: () => void } {
  const log = logger.child({ component: 'branch-watcher' });
  const watchers = new Map<string, FSWatcher>();
  const branches = new Map<string, string>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let environments = [...options.environments];

  for (const env of environments) {
    branches.set(env.path, env.branch);
    startWatching(env.path);
  }

  log.info({ count: environments.length }, 'Branch watcher started');

  function startWatching(repoPath: string): void {
    const headPath = join(repoPath, '.git', 'HEAD');

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
      log.debug({ repoPath, err: msg }, 'Failed to watch .git/HEAD');
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
  };
}
