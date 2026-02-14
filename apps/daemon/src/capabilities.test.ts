import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import {
  detectCapabilities,
  detectEnvironments,
  detectModels,
  findGitRepos,
  getRepoMetadata,
} from './capabilities.js';

const mockExecFile = vi.mocked(execFile);
const mockReaddir = vi.mocked(readdir);

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

describe('detectModels', () => {
  it('detects claude models when `which claude` succeeds', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
    });

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
  it('combines models, environments, and permission modes', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
      'git branch --show-current': { stdout: 'main' },
      'git remote get-url origin': { stdout: 'git@github.com:user/shipyard.git' },
    });

    mockReaddir.mockResolvedValueOnce([makeDirent('shipyard', true)] as never);
    mockReaddir.mockResolvedValueOnce([makeDirent('.git', true)] as never);

    const caps = await detectCapabilities();

    expect(caps.models).toHaveLength(4);
    expect(caps.environments).toHaveLength(1);
    expect(caps.permissionModes).toEqual(['default', 'accept-edits', 'bypass']);
  });
});
