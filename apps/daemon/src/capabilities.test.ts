import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import {
  captureTreeSnapshot,
  detectAnthropicAuth,
  detectCapabilities,
  detectEnvironments,
  detectFastMode,
  detectModels,
  findGitRepos,
  getBranchDiff,
  getBranchFiles,
  getDefaultBranch,
  getMergeBase,
  getRepoMetadata,
  getSnapshotDiff,
  getSnapshotFiles,
} from './capabilities.js';

const mockExecFile = vi.mocked(execFile);
const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

function stubExecFile(results: Record<string, { stdout?: string; error?: Error }>) {
  mockExecFile.mockImplementation(((
    command: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string) => void
  ) => {
    const key = `${command} ${args.join(' ')}`;
    const result = results[key];
    if (result?.error) {
      callback(result.error, '');
    } else {
      callback(null, result?.stdout ?? '');
    }
  }) as typeof execFile);
}

function makeDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: '',
    path: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectFastMode', () => {
  it('returns true when settings.json has fastMode: true', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ fastMode: true }));

    const result = await detectFastMode();

    expect(result).toBe(true);
    expect(mockReadFile).toHaveBeenCalledWith('/home/testuser/.claude/settings.json', 'utf-8');
  });

  it('returns false when fastMode is not set', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}));

    const result = await detectFastMode();

    expect(result).toBe(false);
  });

  it('returns false when fastMode is false', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ fastMode: false }));

    const result = await detectFastMode();

    expect(result).toBe(false);
  });

  it('returns false when settings file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await detectFastMode();

    expect(result).toBe(false);
  });

  it('returns false when settings file has malformed JSON', async () => {
    mockReadFile.mockResolvedValueOnce('not valid json{{{');

    const result = await detectFastMode();

    expect(result).toBe(false);
  });
});

describe('detectModels', () => {
  it('detects claude models when `which claude` succeeds', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}));

    const models = await detectModels();

    expect(models).toHaveLength(4);
    expect(models[0]).toEqual({
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      provider: 'claude-code',
      reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    });
    expect(models[1]).toEqual({
      id: 'claude-opus-4-6[1m]',
      label: 'Claude Opus 4.6 (1M)',
      provider: 'claude-code',
      reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    });
    expect(models.every((m) => m.provider === 'claude-code')).toBe(true);
  });

  it('opus models have reasoning capability, sonnet and haiku do not', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}));

    const models = await detectModels();

    const opus = models.filter((m) => m.id.startsWith('claude-opus'));
    const sonnet = models.find((m) => m.id.includes('sonnet'));
    const haiku = models.find((m) => m.id.includes('haiku'));

    for (const m of opus) {
      expect(m.reasoning).toBeDefined();
      expect(m.reasoning?.efforts).toEqual(['low', 'medium', 'high']);
      expect(m.reasoning?.defaultEffort).toBe('high');
    }
    expect(sonnet?.reasoning).toBeUndefined();
    expect(haiku?.reasoning).toBeUndefined();
  });

  it('detects codex models when `which codex` succeeds', async () => {
    stubExecFile({
      'which claude': { error: new Error('not found') },
      'which codex': { stdout: '/usr/local/bin/codex' },
    });

    const models = await detectModels();

    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      provider: 'codex',
    });
    expect(models[1]).toEqual({
      id: 'gpt-5.2-codex',
      label: 'GPT-5.2 Codex',
      provider: 'codex',
      reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    });
  });

  it('gpt-5.3 has no reasoning, gpt-5.2 does', async () => {
    stubExecFile({
      'which claude': { error: new Error('not found') },
      'which codex': { stdout: '/usr/local/bin/codex' },
    });

    const models = await detectModels();

    const gpt53 = models.find((m) => m.id === 'gpt-5.3-codex');
    const gpt52 = models.find((m) => m.id === 'gpt-5.2-codex');

    expect(gpt53?.reasoning).toBeUndefined();
    expect(gpt52?.reasoning).toBeDefined();
    expect(gpt52?.reasoning?.defaultEffort).toBe('medium');
  });

  it('returns empty models when no CLI tools found', async () => {
    stubExecFile({
      'which claude': { error: new Error('not found') },
      'which codex': { error: new Error('not found') },
    });

    const models = await detectModels();

    expect(models).toEqual([]);
  });

  it('includes opus fast model when fastMode is enabled in settings', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ fastMode: true }));

    const models = await detectModels();

    expect(models).toHaveLength(5);
    const fastModel = models.find((m) => m.id === 'claude-opus-4-6-fast');
    expect(fastModel).toEqual({
      id: 'claude-opus-4-6-fast',
      label: 'Claude Opus 4.6 (Fast)',
      provider: 'claude-code',
      reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
    });
  });

  it('excludes opus fast model when fastMode is disabled', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
    });
    mockReadFile.mockResolvedValueOnce(JSON.stringify({ fastMode: false }));

    const models = await detectModels();

    expect(models).toHaveLength(4);
    expect(models.find((m) => m.id === 'claude-opus-4-6-fast')).toBeUndefined();
  });
});

describe('findGitRepos', () => {
  it('returns directory when .git is found', async () => {
    mockReaddir.mockResolvedValueOnce([makeDirent('.git', true), makeDirent('src', true)] as never);

    const repos = await findGitRepos('/home/testuser/project');

    expect(repos).toEqual(['/home/testuser/project']);
  });

  it('recurses into subdirectories', async () => {
    mockReaddir
      .mockResolvedValueOnce([
        makeDirent('project-a', true),
        makeDirent('project-b', true),
      ] as never)
      .mockResolvedValueOnce([makeDirent('.git', true)] as never)
      .mockResolvedValueOnce([makeDirent('.git', true)] as never);

    const repos = await findGitRepos('/home/testuser');

    expect(repos).toEqual(['/home/testuser/project-a', '/home/testuser/project-b']);
  });

  it('skips excluded directories', async () => {
    mockReaddir.mockResolvedValueOnce([
      makeDirent('node_modules', true),
      makeDirent('Library', true),
      makeDirent('real-project', true),
    ] as never);
    mockReaddir.mockResolvedValueOnce([makeDirent('.git', true)] as never);

    const repos = await findGitRepos('/home/testuser');

    expect(repos).toEqual(['/home/testuser/real-project']);
  });

  it('skips dot-directories at all depths', async () => {
    mockReaddir
      .mockResolvedValueOnce([
        makeDirent('.cache', true),
        makeDirent('.nvm', true),
        makeDirent('visible', true),
      ] as never)
      .mockResolvedValueOnce([makeDirent('.git', true)] as never);

    const repos = await findGitRepos('/home/testuser');

    expect(repos).toEqual(['/home/testuser/visible']);
  });

  it('returns empty on readdir failure', async () => {
    mockReaddir.mockRejectedValueOnce(new Error('EACCES'));

    const repos = await findGitRepos('/restricted');

    expect(repos).toEqual([]);
  });

  it('respects MAX_DEPTH', async () => {
    const repos = await findGitRepos('/deep/path', 5);

    expect(repos).toEqual([]);
    expect(mockReaddir).not.toHaveBeenCalled();
  });
});

describe('getRepoMetadata', () => {
  it('returns repo info with branch and remote', async () => {
    stubExecFile({
      'git branch --show-current': { stdout: 'main\n' },
      'git remote get-url origin': { stdout: 'git@github.com:user/repo.git\n' },
    });

    const info = await getRepoMetadata('/home/testuser/repo');

    expect(info).toEqual({
      path: '/home/testuser/repo',
      name: 'repo',
      branch: 'main',
      remote: 'git@github.com:user/repo.git',
    });
  });

  it('defaults branch to HEAD when empty', async () => {
    stubExecFile({
      'git branch --show-current': { stdout: '' },
      'git remote get-url origin': { error: new Error('no remote') },
    });

    const info = await getRepoMetadata('/home/testuser/detached');

    expect(info).toEqual({
      path: '/home/testuser/detached',
      name: 'detached',
      branch: 'HEAD',
    });
  });

  it('omits remote when not available', async () => {
    stubExecFile({
      'git branch --show-current': { stdout: 'dev' },
      'git remote get-url origin': { error: new Error('no remote') },
    });

    const info = await getRepoMetadata('/home/testuser/local');

    expect(info).toEqual({
      path: '/home/testuser/local',
      name: 'local',
      branch: 'dev',
    });
    expect(info).not.toHaveProperty('remote');
  });
});

describe('detectEnvironments', () => {
  it('scans from homedir and returns repo info', async () => {
    mockReaddir.mockResolvedValueOnce([makeDirent('project', true)] as never);
    mockReaddir.mockResolvedValueOnce([makeDirent('.git', true)] as never);

    stubExecFile({
      'git branch --show-current': { stdout: 'main' },
      'git remote get-url origin': { stdout: 'git@github.com:user/project.git' },
    });

    const envs = await detectEnvironments();

    expect(envs).toHaveLength(1);
    expect(envs[0]).toEqual({
      path: '/home/testuser/project',
      name: 'project',
      branch: 'main',
      remote: 'git@github.com:user/project.git',
    });
  });

  it('returns empty when no git repos found', async () => {
    mockReaddir.mockResolvedValueOnce([makeDirent('Documents', true)] as never);
    mockReaddir.mockResolvedValueOnce([makeDirent('notes.txt', false)] as never);

    const envs = await detectEnvironments();

    expect(envs).toEqual([]);
  });
});

describe('detectCapabilities', () => {
  it('combines models, environments, permission modes, and auth', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
      'git branch --show-current': { stdout: 'main' },
      'git remote get-url origin': { stdout: 'git@github.com:user/shipyard.git' },
      'claude auth status --json': {
        stdout: JSON.stringify({ loggedIn: true, email: 'dev@test.com' }),
      },
    });

    mockReaddir.mockResolvedValueOnce([makeDirent('shipyard', true)] as never);
    mockReaddir.mockResolvedValueOnce([makeDirent('.git', true)] as never);
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}));

    const caps = await detectCapabilities();

    expect(caps.models).toHaveLength(4);
    expect(caps.environments).toHaveLength(1);
    expect(caps.permissionModes).toEqual(['default', 'accept-edits', 'plan', 'bypass']);
    expect(caps.anthropicAuth).toEqual({
      status: 'authenticated',
      method: 'oauth',
      email: 'dev@test.com',
    });
  });
});

describe('getDefaultBranch', () => {
  it('returns symbolic-ref result when available', async () => {
    stubExecFile({
      'git symbolic-ref refs/remotes/origin/HEAD --short': { stdout: 'origin/main' },
    });

    const branch = await getDefaultBranch('/repo');

    expect(branch).toBe('origin/main');
  });

  it('falls back to origin/main when symbolic-ref fails', async () => {
    stubExecFile({
      'git symbolic-ref refs/remotes/origin/HEAD --short': {
        error: new Error('not a symbolic ref'),
      },
      'git rev-parse --verify origin/main': { stdout: 'abc123' },
    });

    const branch = await getDefaultBranch('/repo');

    expect(branch).toBe('origin/main');
  });

  it('falls back to origin/master when origin/main does not exist', async () => {
    stubExecFile({
      'git symbolic-ref refs/remotes/origin/HEAD --short': {
        error: new Error('not a symbolic ref'),
      },
      'git rev-parse --verify origin/main': { error: new Error('not a valid ref') },
      'git rev-parse --verify origin/master': { stdout: 'def456' },
    });

    const branch = await getDefaultBranch('/repo');

    expect(branch).toBe('origin/master');
  });

  it('returns null when all candidates fail', async () => {
    stubExecFile({
      'git symbolic-ref refs/remotes/origin/HEAD --short': {
        error: new Error('not a symbolic ref'),
      },
      'git rev-parse --verify origin/main': { error: new Error('not a valid ref') },
      'git rev-parse --verify origin/master': { error: new Error('not a valid ref') },
    });

    const branch = await getDefaultBranch('/repo');

    expect(branch).toBeNull();
  });

  it('returns null when symbolic-ref returns empty string', async () => {
    stubExecFile({
      'git symbolic-ref refs/remotes/origin/HEAD --short': { stdout: '' },
      'git rev-parse --verify origin/main': { error: new Error('not a valid ref') },
      'git rev-parse --verify origin/master': { error: new Error('not a valid ref') },
    });

    const branch = await getDefaultBranch('/repo');

    expect(branch).toBeNull();
  });
});

describe('getMergeBase', () => {
  it('returns the merge-base commit hash', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123def456' },
    });

    const base = await getMergeBase('/repo', 'origin/main');

    expect(base).toBe('abc123def456');
  });

  it('returns null when merge-base fails', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { error: new Error('no merge base') },
    });

    const base = await getMergeBase('/repo', 'origin/main');

    expect(base).toBeNull();
  });
});

describe('getBranchDiff', () => {
  it('returns diff between merge-base and HEAD', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff abc123..HEAD --no-color': { stdout: 'diff --git a/file.ts b/file.ts\n+added line' },
    });

    const diff = await getBranchDiff('/repo', 'origin/main');

    expect(diff).toBe('diff --git a/file.ts b/file.ts\n+added line');
  });

  it('returns empty string when merge-base fails', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { error: new Error('no merge base') },
    });

    const diff = await getBranchDiff('/repo', 'origin/main');

    expect(diff).toBe('');
  });

  it('returns empty string when diff command fails', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff abc123..HEAD --no-color': { error: new Error('diff failed') },
    });

    const diff = await getBranchDiff('/repo', 'origin/main');

    expect(diff).toBe('');
  });

  it('truncates diff exceeding 1MB', async () => {
    const largeDiff = 'x'.repeat(1_100_000);
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff abc123..HEAD --no-color': { stdout: largeDiff },
    });

    const diff = await getBranchDiff('/repo', 'origin/main');

    expect(diff.length).toBeLessThan(largeDiff.length);
    expect(diff).toContain('... diff truncated (exceeds 1MB) ...');
  });
});

describe('getBranchFiles', () => {
  it('returns files changed between merge-base and HEAD', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff --name-status abc123..HEAD': {
        stdout: 'M\tsrc/index.ts\nA\tsrc/new-file.ts\nD\tsrc/old-file.ts',
      },
    });

    const files = await getBranchFiles('/repo', 'origin/main');

    expect(files).toEqual([
      { status: 'M', path: 'src/index.ts' },
      { status: 'A', path: 'src/new-file.ts' },
      { status: 'D', path: 'src/old-file.ts' },
    ]);
  });

  it('returns empty array when merge-base fails', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { error: new Error('no merge base') },
    });

    const files = await getBranchFiles('/repo', 'origin/main');

    expect(files).toEqual([]);
  });

  it('returns empty array when diff command fails', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff --name-status abc123..HEAD': { error: new Error('diff failed') },
    });

    const files = await getBranchFiles('/repo', 'origin/main');

    expect(files).toEqual([]);
  });

  it('returns empty array when diff output is empty', async () => {
    stubExecFile({
      'git merge-base origin/main HEAD': { stdout: 'abc123' },
      'git diff --name-status abc123..HEAD': { stdout: '' },
    });

    const files = await getBranchFiles('/repo', 'origin/main');

    expect(files).toEqual([]);
  });
});

describe('captureTreeSnapshot', () => {
  it('returns stash ref when stash create produces output', async () => {
    stubExecFile({
      'git stash create': { stdout: 'stash-ref-abc123' },
    });

    const ref = await captureTreeSnapshot('/repo');

    expect(ref).toBe('stash-ref-abc123');
  });

  it('falls back to HEAD when stash create returns empty', async () => {
    stubExecFile({
      'git stash create': { stdout: '' },
      'git rev-parse HEAD': { stdout: 'head-commit-abc123' },
    });

    const ref = await captureTreeSnapshot('/repo');

    expect(ref).toBe('head-commit-abc123');
  });

  it('returns null when both stash create and rev-parse fail', async () => {
    stubExecFile({
      'git stash create': { error: new Error('stash failed') },
    });

    const ref = await captureTreeSnapshot('/repo');

    expect(ref).toBeNull();
  });
});

describe('getSnapshotDiff', () => {
  it('returns diff between two refs', async () => {
    stubExecFile({
      'git diff abc123 def456 --no-color': {
        stdout: 'diff --git a/file.ts b/file.ts\n-old line\n+new line',
      },
    });

    const diff = await getSnapshotDiff('/repo', 'abc123', 'def456');

    expect(diff).toBe('diff --git a/file.ts b/file.ts\n-old line\n+new line');
  });

  it('returns empty string when diff fails', async () => {
    stubExecFile({
      'git diff abc123 def456 --no-color': { error: new Error('bad ref') },
    });

    const diff = await getSnapshotDiff('/repo', 'abc123', 'def456');

    expect(diff).toBe('');
  });

  it('truncates diff exceeding 1MB', async () => {
    const largeDiff = 'y'.repeat(1_100_000);
    stubExecFile({
      'git diff abc123 def456 --no-color': { stdout: largeDiff },
    });

    const diff = await getSnapshotDiff('/repo', 'abc123', 'def456');

    expect(diff.length).toBeLessThan(largeDiff.length);
    expect(diff).toContain('... diff truncated (exceeds 1MB) ...');
  });
});

describe('getSnapshotFiles', () => {
  it('returns files changed between two refs', async () => {
    stubExecFile({
      'git diff --name-status abc123 def456': {
        stdout: 'M\tsrc/index.ts\nA\tsrc/new.ts',
      },
    });

    const files = await getSnapshotFiles('/repo', 'abc123', 'def456');

    expect(files).toEqual([
      { status: 'M', path: 'src/index.ts' },
      { status: 'A', path: 'src/new.ts' },
    ]);
  });

  it('returns empty array when diff fails', async () => {
    stubExecFile({
      'git diff --name-status abc123 def456': { error: new Error('bad ref') },
    });

    const files = await getSnapshotFiles('/repo', 'abc123', 'def456');

    expect(files).toEqual([]);
  });

  it('returns empty array when diff output is empty', async () => {
    stubExecFile({
      'git diff --name-status abc123 def456': { stdout: '' },
    });

    const files = await getSnapshotFiles('/repo', 'abc123', 'def456');

    expect(files).toEqual([]);
  });
});

describe('detectAnthropicAuth', () => {
  it('returns api-key when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    try {
      const auth = await detectAnthropicAuth();
      expect(auth).toEqual({ status: 'authenticated', method: 'api-key' });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('returns oauth when claude auth status reports loggedIn', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    stubExecFile({
      'claude auth status --json': {
        stdout: JSON.stringify({ loggedIn: true, email: 'user@example.com' }),
      },
    });

    const auth = await detectAnthropicAuth();

    expect(auth).toEqual({
      status: 'authenticated',
      method: 'oauth',
      email: 'user@example.com',
    });
  });

  it('returns unauthenticated when claude reports not logged in', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    stubExecFile({
      'claude auth status --json': {
        stdout: JSON.stringify({ loggedIn: false }),
      },
    });

    const auth = await detectAnthropicAuth();

    expect(auth).toEqual({ status: 'unauthenticated', method: 'none' });
  });

  it('returns unknown when claude is not found', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    stubExecFile({
      'claude auth status --json': { error: new Error('not found') },
    });

    const auth = await detectAnthropicAuth();

    expect(auth).toEqual({ status: 'unknown', method: 'none' });
  });
});
