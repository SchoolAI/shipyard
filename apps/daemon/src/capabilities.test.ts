import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { detectCapabilities, detectEnvironments, detectModels } from './capabilities.js';

const mockExecFile = vi.mocked(execFile);

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

    expect(models).toHaveLength(3);
    expect(models[0]).toEqual({
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      provider: 'claude-code',
      supportsReasoning: true,
    });
    expect(models.every((m) => m.provider === 'claude-code')).toBe(true);
  });

  it('detects codex model when `which codex` succeeds', async () => {
    stubExecFile({
      'which claude': { error: new Error('not found') },
      'which codex': { stdout: '/usr/local/bin/codex' },
    });

    const models = await detectModels();

    expect(models).toHaveLength(1);
    expect(models[0]).toEqual({
      id: 'codex-mini-latest',
      label: 'Codex Mini',
      provider: 'codex',
      supportsReasoning: false,
    });
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

describe('detectEnvironments', () => {
  it('detects git repo info from cwd', async () => {
    stubExecFile({
      'git rev-parse --show-toplevel': { stdout: '/home/user/projects/shipyard\n' },
      'git branch --show-current': { stdout: 'main\n' },
      'git remote get-url origin': { stdout: 'git@github.com:user/shipyard.git\n' },
    });

    const envs = await detectEnvironments('/home/user/projects/shipyard');

    expect(envs).toHaveLength(1);
    expect(envs[0]).toEqual({
      path: '/home/user/projects/shipyard',
      name: 'shipyard',
      branch: 'main',
      remote: 'git@github.com:user/shipyard.git',
    });
  });

  it('returns empty environments for non-git directory', async () => {
    stubExecFile({
      'git rev-parse --show-toplevel': { error: new Error('fatal: not a git repository') },
      'git branch --show-current': { error: new Error('fatal: not a git repository') },
    });

    const envs = await detectEnvironments('/tmp/not-a-repo');

    expect(envs).toEqual([]);
  });

  it('handles missing remote gracefully', async () => {
    stubExecFile({
      'git rev-parse --show-toplevel': { stdout: '/home/user/local-repo' },
      'git branch --show-current': { stdout: 'dev' },
      'git remote get-url origin': { error: new Error('fatal: No such remote') },
    });

    const envs = await detectEnvironments('/home/user/local-repo');

    expect(envs).toHaveLength(1);
    expect(envs[0]).toEqual({
      path: '/home/user/local-repo',
      name: 'local-repo',
      branch: 'dev',
    });
  });

  it('handles command timeout gracefully', async () => {
    stubExecFile({
      'git rev-parse --show-toplevel': {
        error: Object.assign(new Error('timed out'), { killed: true }),
      },
      'git branch --show-current': {
        error: Object.assign(new Error('timed out'), { killed: true }),
      },
    });

    const envs = await detectEnvironments('/tmp/slow');

    expect(envs).toEqual([]);
  });
});

describe('detectCapabilities', () => {
  it('combines models, environments, and permission modes', async () => {
    stubExecFile({
      'which claude': { stdout: '/usr/local/bin/claude' },
      'which codex': { error: new Error('not found') },
      'git rev-parse --show-toplevel': { stdout: '/home/user/projects/shipyard' },
      'git branch --show-current': { stdout: 'main' },
      'git remote get-url origin': { stdout: 'git@github.com:user/shipyard.git' },
    });

    const caps = await detectCapabilities({ cwd: '/home/user/projects/shipyard' });

    expect(caps.models).toHaveLength(3);
    expect(caps.environments).toHaveLength(1);
    expect(caps.permissionModes).toEqual(['default', 'accept-edits', 'bypass']);
  });
});
