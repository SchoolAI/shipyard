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
import type { GitRepoInfo } from '@shipyard/session';
import { createBranchWatcher } from './branch-watcher.js';
import { getRepoMetadata } from './capabilities.js';

const mockGetRepoMetadata = vi.mocked(getRepoMetadata);
const mockWatch = vi.mocked(watch);

function makeEnv(path: string, branch: string, remote?: string): GitRepoInfo {
  const name = path.split('/').pop() ?? path;
  return { path, name, branch, ...(remote && { remote }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fsListeners.clear();
  closedPaths.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createBranchWatcher', () => {
  it('sets up fs.watch for each environment .git/HEAD', () => {
    const envs = [makeEnv('/home/user/repo-a', 'main'), makeEnv('/home/user/repo-b', 'develop')];

    const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });

    expect(mockWatch).toHaveBeenCalledTimes(2);
    expect(mockWatch).toHaveBeenCalledWith('/home/user/repo-a/.git/HEAD', expect.any(Function));
    expect(mockWatch).toHaveBeenCalledWith('/home/user/repo-b/.git/HEAD', expect.any(Function));

    watcher.close();
  });

  it('calls onUpdate when a branch changes after debounce', async () => {
    const envs = [makeEnv('/home/user/repo', 'main')];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });

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

    mockGetRepoMetadata.mockResolvedValueOnce(null);

    fsListeners.get('/home/user/repo-a/.git/HEAD')!();
    await vi.advanceTimersByTimeAsync(500);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith([makeEnv('/home/user/repo-b', 'develop')]);

    watcher.close();
  });

  it('close() tears down all watchers and timers', () => {
    const envs = [makeEnv('/home/user/repo-a', 'main'), makeEnv('/home/user/repo-b', 'develop')];
    const watcher = createBranchWatcher({ environments: envs, onUpdate: vi.fn() });

    expect(fsListeners.size).toBe(2);

    watcher.close();

    expect(closedPaths.has('/home/user/repo-a/.git/HEAD')).toBe(true);
    expect(closedPaths.has('/home/user/repo-b/.git/HEAD')).toBe(true);
  });

  it('handles watch() throwing for a repo path gracefully', () => {
    mockWatch.mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });

    const envs = [makeEnv('/home/user/missing-repo', 'main')];
    const onUpdate = vi.fn();

    expect(() => {
      const watcher = createBranchWatcher({ environments: envs, onUpdate });
      watcher.close();
    }).not.toThrow();
  });

  it('updates only the changed repo in a multi-repo environment', async () => {
    const envs = [
      makeEnv('/home/user/repo-a', 'main', 'git@github.com:user/a.git'),
      makeEnv('/home/user/repo-b', 'develop', 'git@github.com:user/b.git'),
    ];
    const onUpdate = vi.fn();
    const watcher = createBranchWatcher({ environments: envs, onUpdate });

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
});
