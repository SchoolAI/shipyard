/**
 * Agent spawner - manages Claude Code child processes
 *
 * Spawns and tracks Claude Code sessions for tasks.
 * Each agent runs with SHIPYARD_TASK_ID environment variable.
 */

import { execSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  a2aToClaudeCode,
  formatAsClaudeCodeJSONL,
  validateA2AMessages,
} from '@shipyard/schema';
import { getProjectPath, getSessionTranscriptPath } from '@shipyard/schema/claude-paths';
import { nanoid } from 'nanoid';
import { daemonConfig } from './config.js';
import { logger } from './logger.js';
import type { ActiveAgent, SpawnAgentOptions, SpawnWithContextOptions } from './types.js';

const activeAgents = new Map<string, ActiveAgent>();

/**
 * Spawn locks to prevent race conditions.
 * When a spawn is in progress for a taskId, concurrent requests wait for it to complete.
 */
const spawnLocks = new Map<string, Promise<void>>();

/**
 * Acquires a spawn lock for the given taskId.
 * If a spawn is already in progress, waits for it to complete first.
 * Returns a release function that must be called when the spawn is complete.
 */
async function acquireSpawnLock(taskId: string): Promise<() => void> {
  while (true) {
    const existingLock = spawnLocks.get(taskId);
    if (existingLock) {
      await existingLock;
      continue;
    }
    let releaseLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    spawnLocks.set(taskId, lockPromise);
    return () => {
      spawnLocks.delete(taskId);
      releaseLock();
    };
  }
}

function getClaudePath(): string {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

function buildShipyardSystemPrompt(taskId: string): string {
  const taskUrl = `${daemonConfig.SHIPYARD_WEB_URL}/task/${taskId}`;
  return `[SHIPYARD AUTONOMOUS AGENT]

You are working on an existing Shipyard task.

Task ID: ${taskId}
Browser View: ${taskUrl}

The human created this task in the browser and is viewing your progress.

Use the Shipyard MCP tools to read the task and upload artifacts as you complete deliverables.`;
}

async function buildCommonSpawnArgs(taskId: string, mcpConfigPath: string | null): Promise<string[]> {
  const systemPrompt = buildShipyardSystemPrompt(taskId);

  const args = [
    '--dangerously-skip-permissions',
  ];

  if (daemonConfig.LOG_LEVEL === 'debug') {
    const debugLogPath = `/tmp/shipyard-agent-${taskId}-debug.log`;
    args.push('--debug', 'api,hooks', '--debug-file', debugLogPath);
    logger.info({ debugLogPath }, 'Debug logging enabled for spawned agent');
  }

  args.push('--append-system-prompt', systemPrompt);
  args.push(...buildMcpConfigArgs(mcpConfigPath));

  /**
   * NOTE: We intentionally do NOT use --plugin-dir for daemon spawns.
   * The plugin would load SessionStart hooks that output conflicting instructions.
   * Instead, we rely on:
   * - --mcp-config for MCP tools (execute_code, add_artifact, etc.)
   * - --append-system-prompt for all autonomous agent instructions
   * This is simpler and avoids the hook context detection problem.
   */

  return args;
}


function buildMcpConfigArgs(mcpConfigPath: string | null): string[] {
  if (mcpConfigPath) {
    logger.info({ mcpConfigPath }, 'Using MCP config');
    return ['--mcp-config', mcpConfigPath];
  }
  logger.warn('No MCP config found - Shipyard tools will not be available');
  return [];
}

function trackAgent(taskId: string, child: ChildProcess): void {
  if (child.pid) {
    activeAgents.set(taskId, {
      taskId,
      process: child,
      pid: child.pid,
      startedAt: Date.now(),
    });
  }

  child.once('exit', () => {
    activeAgents.delete(taskId);
    logger.info({ taskId }, 'Agent exited');
  });
}

function stopExistingAgentIfRunning(taskId: string): void {
  if (activeAgents.has(taskId)) {
    logger.info({ taskId }, 'Stopping existing agent');
    stopAgent(taskId);
  }
}

/**
 * Resolves MCP config with absolute paths and writes to temp file.
 * This ensures relative paths in .mcp.json work regardless of spawned agent's cwd.
 */
async function getResolvedMcpConfigPath(): Promise<string | null> {
  const currentFile = fileURLToPath(import.meta.url);
  const daemonDir = dirname(currentFile);
  const projectRoot = resolve(daemonDir, '../../..');

  const candidates = [
    join(projectRoot, '.mcp.json'),
    join(process.cwd(), '.mcp.json'),
  ];

  let sourcePath: string | null = null;
  for (const path of candidates) {
    if (existsSync(path)) {
      sourcePath = path;
      break;
    }
  }

  if (!sourcePath) {
    return null;
  }

  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');

  const configContent = await readFile(sourcePath, 'utf-8');
  let config;
  try {
    config = JSON.parse(configContent);
  } catch (err) {
    throw new Error(`Failed to parse MCP config at ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (config.mcpServers) {
    for (const [_serverName, serverConfig] of Object.entries(config.mcpServers)) {
      if (!serverConfig || typeof serverConfig !== 'object') continue;
      const server = Object.fromEntries(Object.entries(serverConfig));
      if (Array.isArray(server.args)) {
        server.args = server.args.map((arg: unknown) => {
          if (typeof arg !== 'string') return arg;
          if (arg.includes('/') && !arg.startsWith('/') && !arg.startsWith('-')) {
            const absolutePath = resolve(projectRoot, arg);
            if (existsSync(absolutePath)) {
              return absolutePath;
            }
          }
          return arg;
        });
      }
    }
  }

  const tempDir = join(tmpdir(), 'shipyard-daemon');
  await mkdir(tempDir, { recursive: true });
  const tempConfigPath = join(tempDir, 'mcp-config.json');
  await writeFile(tempConfigPath, JSON.stringify(config, null, 2), 'utf-8');

  logger.info({ tempConfigPath }, 'Created resolved MCP config');
  return tempConfigPath;
}

export async function spawnClaudeCode(opts: SpawnAgentOptions): Promise<ChildProcess> {
  const { taskId, prompt, cwd } = opts;

  const releaseLock = await acquireSpawnLock(taskId);

  try {
    stopExistingAgentIfRunning(taskId);

    await mkdir(cwd, { recursive: true });

    const claudePath = getClaudePath();
    const mcpConfigPath = await getResolvedMcpConfigPath();
    const commonArgs = await buildCommonSpawnArgs(taskId, mcpConfigPath);
    const args = ['-p', prompt, ...commonArgs];

    logger.info({ taskId, command: claudePath, args: args.join(' '), cwd }, 'Spawning Claude Code');

    const child = spawn(
      claudePath,
      args,
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SHIPYARD_TASK_ID: taskId,
        },
      }
    );

    child.on('error', (err) => {
      logger.error({ taskId, err: err.message }, 'Spawn error');
    });

    trackAgent(taskId, child);
    return child;
  } finally {
    releaseLock();
  }
}

/**
 * Stops a running agent by task ID.
 * Sends SIGTERM to the process and removes it from tracking.
 * @param taskId - The task ID of the agent to stop
 * @returns true if agent was found and stopped, false if no agent was running for this task
 */
export function stopAgent(taskId: string): boolean {
  const agent = activeAgents.get(taskId);
  if (!agent) {
    return false;
  }

  agent.process.kill('SIGTERM');
  activeAgents.delete(taskId);
  logger.info({ taskId }, 'Stopped agent');
  return true;
}

/**
 * Lists all currently active agents.
 * @returns Array of agent info objects containing taskId, pid, and uptime in milliseconds
 */
export function listAgents(): Array<{ taskId: string; pid: number; uptime: number }> {
  const now = Date.now();
  return Array.from(activeAgents.values()).map((agent) => ({
    taskId: agent.taskId,
    pid: agent.pid,
    uptime: now - agent.startedAt,
  }));
}

/**
 * Gets the child process for a running agent.
 * @param taskId - The task ID of the agent
 * @returns The ChildProcess if agent is running, undefined otherwise
 */
export function getAgentProcess(taskId: string): ChildProcess | undefined {
  return activeAgents.get(taskId)?.process;
}

/**
 * Spawns Claude Code with full conversation context from A2A payload.
 * Creates a session file and spawns with --resume flag.
 */
export async function spawnClaudeCodeWithContext(
  opts: SpawnWithContextOptions
): Promise<{ child: ChildProcess; sessionId: string }> {
  const { taskId, cwd, a2aPayload } = opts;

  const releaseLock = await acquireSpawnLock(taskId);

  try {
    stopExistingAgentIfRunning(taskId);

    await mkdir(cwd, { recursive: true });

    if (!Array.isArray(a2aPayload.messages)) {
      throw new Error('a2aPayload.messages must be an array');
    }

    const { valid, errors } = validateA2AMessages(a2aPayload.messages);
    if (errors.length > 0) {
      throw new Error(`Invalid A2A messages: ${errors.map((e) => e.error).join(', ')}`);
    }

    if (valid.length === 0) {
      throw new Error('Cannot spawn agent with empty conversation');
    }

    const sessionId = nanoid();
    const claudeMessages = a2aToClaudeCode(valid, sessionId);
    const jsonl = formatAsClaudeCodeJSONL(claudeMessages);

    const planId = a2aPayload.meta.planId ?? taskId;

    const projectPath = getProjectPath(planId, daemonConfig.CLAUDE_PROJECTS_DIR);
    await mkdir(projectPath, { recursive: true });

    const transcriptPath = getSessionTranscriptPath(projectPath, sessionId);
    await writeFile(transcriptPath, jsonl, 'utf-8');

    logger.info({ taskId, transcriptPath }, 'Created session file');

    const claudePath = getClaudePath();
    const mcpConfigPath = await getResolvedMcpConfigPath();
    const commonArgs = await buildCommonSpawnArgs(taskId, mcpConfigPath);
    const args = ['-r', sessionId, '-p', 'Continue working on this task.', ...commonArgs];

    logger.info({ taskId, sessionId, command: claudePath, args: args.join(' '), cwd }, 'Spawning Claude Code with session');

    const child = spawn(
      claudePath,
      args,
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SHIPYARD_TASK_ID: taskId,
        },
      }
    );

    child.on('error', (err) => {
      logger.error({ taskId, err: err.message }, 'Spawn error');
    });

    trackAgent(taskId, child);
    return { child, sessionId };
  } finally {
    releaseLock();
  }
}
