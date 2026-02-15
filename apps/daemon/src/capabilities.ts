import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
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

function runWithTimeout(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, cwd, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

const DIFF_TIMEOUT_MS = 15_000;
const MAX_DIFF_SIZE = 1_000_000;

export async function getUnstagedDiff(cwd: string): Promise<string> {
  const result = await runWithTimeout('git', ['diff', '--no-color'], cwd, DIFF_TIMEOUT_MS);
  return result.length > MAX_DIFF_SIZE
    ? `${result.slice(0, MAX_DIFF_SIZE)}\n\n... diff truncated (exceeds 1MB) ...\n`
    : result;
}

export async function getStagedDiff(cwd: string): Promise<string> {
  const result = await runWithTimeout(
    'git',
    ['diff', '--cached', '--no-color'],
    cwd,
    DIFF_TIMEOUT_MS
  );
  return result.length > MAX_DIFF_SIZE
    ? `${result.slice(0, MAX_DIFF_SIZE)}\n\n... diff truncated (exceeds 1MB) ...\n`
    : result;
}

export async function getChangedFiles(
  cwd: string
): Promise<Array<{ path: string; status: string }>> {
  const out = await runWithTimeout('git', ['status', '--porcelain'], cwd, DIFF_TIMEOUT_MS);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }));
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
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
      },
      {
        id: 'claude-opus-4-6[1m]',
        label: 'Claude Opus 4.6 (1M)',
        provider: 'claude-code',
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        label: 'Claude Sonnet 4.5',
        provider: 'claude-code',
      },
      {
        id: 'claude-haiku-4-5-20251001',
        label: 'Claude Haiku 4.5',
        provider: 'claude-code',
      }
    );
  } catch {}

  try {
    await run('which', ['codex']);
    models.push(
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        provider: 'codex',
      },
      {
        id: 'gpt-5.2-codex',
        label: 'GPT-5.2 Codex',
        provider: 'codex',
        reasoning: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
      }
    );
  } catch {}

  return models;
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'Library',
  'Applications',
  'Pictures',
  'Music',
  'Movies',
  'go',
  '.Trash',
]);

const MAX_DEPTH = 4;

export async function findGitRepos(dir: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git') {
        return [dir];
      }
    }

    if (depth >= MAX_DEPTH) return [];

    const promises: Promise<string[]>[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      promises.push(findGitRepos(join(dir, entry.name), depth + 1));
    }

    const results = await Promise.all(promises);
    return results.flat();
  } catch {
    return [];
  }
}

export async function getRepoMetadata(repoPath: string): Promise<GitRepoInfo | null> {
  try {
    const [branchResult, remoteResult] = await Promise.allSettled([
      run('git', ['branch', '--show-current'], repoPath),
      run('git', ['remote', 'get-url', 'origin'], repoPath),
    ]);

    const branch = branchResult.status === 'fulfilled' ? branchResult.value || 'HEAD' : 'HEAD';
    const remote =
      remoteResult.status === 'fulfilled' ? remoteResult.value || undefined : undefined;

    return {
      path: repoPath,
      name: basename(repoPath),
      branch,
      ...(remote && { remote }),
    };
  } catch {
    return null;
  }
}

export async function detectEnvironments(): Promise<GitRepoInfo[]> {
  const repoPaths = await findGitRepos(homedir());
  const repoInfos = await Promise.all(repoPaths.map(getRepoMetadata));
  return repoInfos.filter((info): info is GitRepoInfo => info !== null);
}

export async function detectCapabilities(): Promise<MachineCapabilities> {
  const [models, environments] = await Promise.all([detectModels(), detectEnvironments()]);

  const permissionModes = [...PermissionModeSchema.options];

  return { models, environments, permissionModes, homeDir: homedir() };
}
