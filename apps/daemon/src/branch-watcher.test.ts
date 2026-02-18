import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsListeners = new Map<string, () => void>();
const closedPaths = new Set<string>();

vi.mock('node:fs', () => ({
  watch: vi.fn((path: string, callback: () => void) => {
    fsListeners.set(path, callback);
    const watcher = {
      close: vi.fn(() => {
        closedPaths.add(path);
        fsListeners.delete(path);
      }),
      on: vi.fn(() => watcher),
    };
    return watcher;
  }),
}));

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('./capabilities.js', () => ({
  getRepoMetadata: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { GitRepoInfo } from '@shipyard/session';
import { createBranchWatcher } from './branch-watcher.js';
import { getRepoMetadata } from './capabilities.js';

const mockGetRepoMetadata = vi.mocked(getRepoMetadata);
const mockWatch = vi.mocked(watch);
const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);

function makeEnv(path: string, branch: string, remote?: string): GitRepoInfo {
  const name = path.split('/').pop() ?? path;
  return { path, name, branch, ...(remote && { remote }) };
}

type StatResult = Awaited<ReturnType<typeof stat>>;

/** Default mock: .git is a directory (regular repo) */
function mockRegularRepo(): void {
  mockStat.mockResolvedValue({
    isDirectory: () => true,
  } as StatResult);
}

/** Mock a worktree: .git is a file containing gitdir pointer */
function mockWorktreeRepo(gitdir: string): void {
  mockStat.mockResolvedValue({
    isDirectory: () => false,
  } as StatResult);
  mockReadFile.mockResolvedValue(`gitdir: ${gitdir}\n`);
}

/** Flush microtask queue so async startWatching resolves */
async function flushMicrotasks(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fsListeners.clear();
  closedPaths.clear();
  mockRegularRepo();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createBranchWatcher', () => {
  it('sets up fs.watch for each environment .git/HEAD', async () => {
    const envs = [makeEnv('/home/user/repo-a', 'main'), makeEnv('/home/user/repo-b', 'develop')];

    const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
    await flushMicrotasks();

    expect(mockWatch).toHaveBeenCalledTimes(2);
    expect(mockWatch).toHaveBeenCalledWith('/home/user/repo-a/.git/HEAD', expect.any(Function));
    expect(mockWatch).toHaveBeenCalledWith('/home/user/repo-b/.git/HEAD', expect.any(Function));

    watcher.close();
  });

  it('calls onUpdate when a branch changes after debounce', async () => {
    const envs = [makeEnv('/home/user/repo', 'main')];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();

    mockGetRepoMetadata.mockResolvedValueOnce(makeEnv('/home/user/repo', 'feature-x'));

    const listener = fsListeners.get('/home/user/repo/.git/HEAD');
    expect(listener).toBeDefined();
    listener!();

    expect(onUpdate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(mockGetRepoMetadata).toHaveBeenCalledWith('/home/user/repo');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith([makeEnv('/home/user/repo', 'feature-x')]);

    watcher.close();
  });

  it('does not call onUpdate when branch has not changed', async () => {
    const envs = [makeEnv('/home/user/repo', 'main')];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();

    mockGetRepoMetadata.mockResolvedValueOnce(makeEnv('/home/user/repo', 'main'));

    fsListeners.get('/home/user/repo/.git/HEAD')!();
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).not.toHaveBeenCalled();

    watcher.close();
  });

  it('debounces rapid changes within 500ms window', async () => {
    const envs = [makeEnv('/home/user/repo', 'main')];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();

    mockGetRepoMetadata.mockResolvedValue(makeEnv('/home/user/repo', 'feature-y'));

    const trigger = fsListeners.get('/home/user/repo/.git/HEAD')!;

    trigger();
    await vi.advanceTimersByTimeAsync(200);
    trigger();
    await vi.advanceTimersByTimeAsync(200);
    trigger();
    await vi.advanceTimersByTimeAsync(500);

    expect(mockGetRepoMetadata).toHaveBeenCalledTimes(1);

    watcher.close();
  });

  it('removes watcher and updates environments when repo becomes inaccessible', async () => {
    const envs = [makeEnv('/home/user/repo-a', 'main'), makeEnv('/home/user/repo-b', 'develop')];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();

    mockGetRepoMetadata.mockResolvedValueOnce(null);

    fsListeners.get('/home/user/repo-a/.git/HEAD')!();
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith([makeEnv('/home/user/repo-b', 'develop')]);

    watcher.close();
  });

  it('close() tears down all watchers and timers', async () => {
    const envs = [makeEnv('/home/user/repo-a', 'main'), makeEnv('/home/user/repo-b', 'develop')];
    const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
    await flushMicrotasks();

    expect(fsListeners.size).toBe(2);

    watcher.close();

    expect(closedPaths.has('/home/user/repo-a/.git/HEAD')).toBe(true);
    expect(closedPaths.has('/home/user/repo-b/.git/HEAD')).toBe(true);
  });

  it('handles watch() throwing for a repo path gracefully', async () => {
    mockWatch.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    const envs = [makeEnv('/home/user/missing-repo', 'main')];
    const onUpdate = vi.fn();

    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();
    watcher.close();
  });

  it('updates only the changed repo in a multi-repo environment', async () => {
    const envs = [
      makeEnv('/home/user/repo-a', 'main', 'git@github.com:user/a.git'),
      makeEnv('/home/user/repo-b', 'develop', 'git@github.com:user/b.git'),
    ];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });
    await flushMicrotasks();

    mockGetRepoMetadata.mockResolvedValueOnce(
      makeEnv('/home/user/repo-b', 'feature-z', 'git@github.com:user/b.git')
    );

    fsListeners.get('/home/user/repo-b/.git/HEAD')!();
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updated = onUpdate.mock.calls[0]![0];
    expect(updated).toHaveLength(2);
    expect(updated[0]).toEqual(makeEnv('/home/user/repo-a', 'main', 'git@github.com:user/a.git'));
    expect(updated[1]).toEqual(
      makeEnv('/home/user/repo-b', 'feature-z', 'git@github.com:user/b.git')
    );

    watcher.close();
  });

  describe('worktree support', () => {
    it('resolves HEAD path from .git file for worktrees with absolute gitdir', async () => {
      mockWorktreeRepo('/home/user/main-repo/.git/worktrees/feature-branch');

      const envs = [makeEnv('/home/user/worktree', 'feature-branch')];
      const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
      await flushMicrotasks();

      expect(mockWatch).toHaveBeenCalledTimes(1);
      expect(mockWatch).toHaveBeenCalledWith(
        '/home/user/main-repo/.git/worktrees/feature-branch/HEAD',
        expect.any(Function)
      );

      watcher.close();
    });

    it('resolves HEAD path from .git file for worktrees with relative gitdir', async () => {
      mockWorktreeRepo('../main-repo/.git/worktrees/feature-branch');

      const envs = [makeEnv('/home/user/worktree', 'feature-branch')];
      const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
      await flushMicrotasks();

      expect(mockWatch).toHaveBeenCalledTimes(1);
      // join() normalizes the ../  segments
      expect(mockWatch).toHaveBeenCalledWith(
        '/home/user/main-repo/.git/worktrees/feature-branch/HEAD',
        expect.any(Function)
      );

      watcher.close();
    });

    it('skips watching when .git file has invalid content', async () => {
      mockStat.mockResolvedValue({
        isDirectory: () => false,
      } as StatResult);
      mockReadFile.mockResolvedValue('not a gitdir pointer\n');

      const envs = [makeEnv('/home/user/bad-worktree', 'main')];
      const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
      await flushMicrotasks();

      expect(mockWatch).not.toHaveBeenCalled();

      watcher.close();
    });

    it('skips watching when stat fails (no .git at all)', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const envs = [makeEnv('/home/user/not-a-repo', 'main')];
      const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });
      await flushMicrotasks();

      expect(mockWatch).not.toHaveBeenCalled();

      watcher.close();
    });

    it('watches worktree HEAD and triggers branch change detection', async () => {
      mockWorktreeRepo('/home/user/main-repo/.git/worktrees/my-wt');

      const envs = [makeEnv('/home/user/worktree', 'feature-a')];
      const onUpdate = vi.fn();
      const watcher = createBranchWatcher({ environments: envs, onUpdate });
      await flushMicrotasks();

      mockGetRepoMetadata.mockResolvedValueOnce(makeEnv('/home/user/worktree', 'feature-b'));

      const headPath = '/home/user/main-repo/.git/worktrees/my-wt/HEAD';
      const listener = fsListeners.get(headPath);
      expect(listener).toBeDefined();
      listener!();

      await vi.advanceTimersByTimeAsync(500);

      expect(mockGetRepoMetadata).toHaveBeenCalledWith('/home/user/worktree');
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate).toHaveBeenCalledWith([makeEnv('/home/user/worktree', 'feature-b')]);

      watcher.close();
    });

    it('addEnvironment resolves worktree HEAD correctly', async () => {
      const watcher = createBranchWatcher({ environments: [], onUpdate: vi.fn() });
      await flushMicrotasks();

      mockWorktreeRepo('/home/user/main/.git/worktrees/wt-branch');

      watcher.addEnvironment('/home/user/wt', 'wt-branch');
      await flushMicrotasks();

      expect(mockWatch).toHaveBeenCalledWith(
        '/home/user/main/.git/worktrees/wt-branch/HEAD',
        expect.any(Function)
      );

      watcher.close();
    });
  });
});
