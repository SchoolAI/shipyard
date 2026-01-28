/**
 * Agent spawner - manages Claude Code child processes
 *
 * Spawns and tracks Claude Code sessions for tasks.
 * Each agent runs with SHIPYARD_TASK_ID environment variable.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { ActiveAgent, SpawnAgentOptions } from './types.js';

const activeAgents = new Map<string, ActiveAgent>();

export function spawnClaudeCode(opts: SpawnAgentOptions): ChildProcess {
  const { taskId, prompt, cwd } = opts;

  /** Stop existing agent if running */
  if (activeAgents.has(taskId)) {
    console.log(`Stopping existing agent for task ${taskId}`);
    stopAgent(taskId);
  }

  console.log(`Spawning Claude Code for task ${taskId} in ${cwd}`);

  const child = spawn(
    'claude',
    ['-p', prompt, '--allowedTools', 'mcp__shipyard__*'],
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

export function listAgents(): Array<{ taskId: string; pid: number }> {
  return Array.from(activeAgents.values()).map((agent) => ({
    taskId: agent.taskId,
    pid: agent.pid,
  }));
}

export function getAgentProcess(taskId: string): ChildProcess | undefined {
  return activeAgents.get(taskId)?.process;
}
