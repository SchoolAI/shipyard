/**
 * Agent spawner - manages Claude Code child processes
 *
 * Spawns and tracks Claude Code sessions for tasks.
 * Each agent runs with SHIPYARD_TASK_ID environment variable.
 */

import { spawn, execSync } from 'node:child_process';
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
import type { ActiveAgent, SpawnAgentOptions, SpawnWithContextOptions } from './types.js';

const activeAgents = new Map<string, ActiveAgent>();

function getClaudePath(): string {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
}

function getMcpConfigPath(): string | null {
  const currentFile = fileURLToPath(import.meta.url);
  const daemonDir = dirname(currentFile);
  const projectRoot = resolve(daemonDir, '../../..');

  const candidates = [
    join(projectRoot, '.mcp.json'),
    join(process.cwd(), '.mcp.json'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

export function spawnClaudeCode(opts: SpawnAgentOptions): ChildProcess {
  const { taskId, prompt, cwd } = opts;

  /** Stop existing agent if running */
  if (activeAgents.has(taskId)) {
    console.log(`Stopping existing agent for task ${taskId}`);
    stopAgent(taskId);
  }

  console.log(`Spawning Claude Code for task ${taskId} in ${cwd}`);

  const mcpConfigPath = getMcpConfigPath();
  const args = ['-p', prompt, '--allowedTools', 'mcp__shipyard__*'];

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  const child = spawn(
    getClaudePath(),
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

  /** Track the agent */
  if (child.pid) {
    activeAgents.set(taskId, {
      taskId,
      process: child,
      pid: child.pid,
      startedAt: Date.now(),
    });
  }

  /** Auto-cleanup on exit */
  child.once('exit', () => {
    activeAgents.delete(taskId);
    console.log(`Agent for task ${taskId} exited`);
  });

  return child;
}

export function stopAgent(taskId: string): boolean {
  const agent = activeAgents.get(taskId);
  if (!agent) {
    return false;
  }

  agent.process.kill('SIGTERM');
  activeAgents.delete(taskId);
  console.log(`Stopped agent for task ${taskId}`);
  return true;
}

export function listAgents(): Array<{ taskId: string; pid: number; uptime: number }> {
  const now = Date.now();
  return Array.from(activeAgents.values()).map((agent) => ({
    taskId: agent.taskId,
    pid: agent.pid,
    uptime: now - agent.startedAt,
  }));
}

export function getAgentProcess(taskId: string): ChildProcess | undefined {
  return activeAgents.get(taskId)?.process;
}

/**
 * Spawns Claude Code with full conversation context from A2A payload.
 * Creates a session file and spawns with --resume flag.
 *
 * @param opts - Spawn options including A2A payload
 * @returns Child process instance and session ID
 * @throws If A2A validation fails or session file creation fails
 */
export async function spawnClaudeCodeWithContext(
  opts: SpawnWithContextOptions
): Promise<{ child: ChildProcess; sessionId: string }> {
  const { taskId, cwd, a2aPayload } = opts;

  /** Stop existing agent if running */
  if (activeAgents.has(taskId)) {
    console.log(`Stopping existing agent for task ${taskId}`);
    stopAgent(taskId);
  }

  /** Validate A2A messages */
  if (!Array.isArray(a2aPayload.messages)) {
    throw new Error('a2aPayload.messages must be an array');
  }

  const { valid, errors } = validateA2AMessages(a2aPayload.messages);
  if (errors.length > 0) {
    throw new Error(`Invalid A2A messages: ${errors.map((e) => e.error).join(', ')}`);
  }

  // Check for empty array (matches registry behavior)
  if (valid.length === 0) {
    throw new Error('Cannot spawn agent with empty conversation');
  }

  /** Generate session ID and convert to Claude Code format */
  const sessionId = nanoid();
  const claudeMessages = a2aToClaudeCode(valid, sessionId);
  const jsonl = formatAsClaudeCodeJSONL(claudeMessages);

  /** Extract plan ID from meta or use taskId */
  const planId = a2aPayload.meta.planId ?? taskId;

  /** Create session file */
  const projectPath = getProjectPath(planId, daemonConfig.CLAUDE_PROJECTS_DIR);
  await mkdir(projectPath, { recursive: true });

  const transcriptPath = getSessionTranscriptPath(projectPath, sessionId);
  await writeFile(transcriptPath, jsonl, 'utf-8');

  console.log(`Created session file for task ${taskId}: ${transcriptPath}`);
  console.log(`Spawning Claude Code with session ${sessionId}`);

  const mcpConfigPath = getMcpConfigPath();
  const args = [
    '-r', sessionId,
    '-p', '',
    '--dangerously-skip-permissions',
    '--allowedTools', 'mcp__shipyard__*',
  ];

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
    console.log(`Using MCP config: ${mcpConfigPath}`);
  }

  const child = spawn(
    getClaudePath(),
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

  /** Track the agent */
  if (child.pid) {
    activeAgents.set(taskId, {
      taskId,
      process: child,
      pid: child.pid,
      startedAt: Date.now(),
    });
  }

  /** Auto-cleanup on exit */
  child.once('exit', () => {
    activeAgents.delete(taskId);
    console.log(`Agent for task ${taskId} exited`);
  });

  return { child, sessionId };
}
