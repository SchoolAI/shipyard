import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import {
  type GitRepoInfo,
  type MachineCapabilities,
  type ModelInfo,
  PermissionModeSchema,
} from '@shipyard/session';

const TIMEOUT_MS = 5_000;

function run(command: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: TIMEOUT_MS, cwd }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function detectModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];

  try {
    await run('which', ['claude']);
    models.push(
      {
        id: 'claude-opus-4-6',
        label: 'Claude Opus 4.6',
        provider: 'claude-code',
        supportsReasoning: true,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        label: 'Claude Sonnet 4.5',
        provider: 'claude-code',
        supportsReasoning: false,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5',
        provider: 'claude-code',
        supportsReasoning: false,
      }
    );
  } catch {
    // claude CLI not available
  }

  try {
    await run('which', ['codex']);
    models.push({
      id: 'codex-mini-latest',
      label: 'Codex Mini',
      provider: 'codex',
      supportsReasoning: false,
    });
  } catch {
    // codex CLI not available
  }

  return models;
}

export async function detectEnvironments(cwd: string): Promise<GitRepoInfo[]> {
  try {
    const [toplevel, branchResult] = await Promise.all([
      run('git', ['rev-parse', '--show-toplevel'], cwd),
      run('git', ['branch', '--show-current'], cwd),
    ]);
    const branch = branchResult || 'HEAD';

    let remote: string | undefined;
    try {
      remote = await run('git', ['remote', 'get-url', 'origin'], cwd);
    } catch {
      // no remote configured
    }

    const env: GitRepoInfo = {
      path: toplevel,
      name: basename(toplevel),
      branch,
      ...(remote !== undefined && { remote }),
    };

    return [env];
  } catch {
    return [];
  }
}

export async function detectCapabilities(options?: { cwd?: string }): Promise<MachineCapabilities> {
  const cwd = options?.cwd ?? process.cwd();

  const [models, environments] = await Promise.all([detectModels(), detectEnvironments(cwd)]);

  const permissionModes = [...PermissionModeSchema.options];

  return { models, environments, permissionModes };
}
