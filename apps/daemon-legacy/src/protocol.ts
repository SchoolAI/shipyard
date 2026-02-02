/**
 * WebSocket message protocol handler
 *
 * Handles messages between browser clients and daemon.
 * Delegates to agent-spawner for process management.
 */

import type { ChildProcess } from 'node:child_process';
import type { WebSocket } from 'ws';
import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';
import { assertNever, ClientMessageSchema } from '@shipyard/schema';
import { listAgents, spawnClaudeCode, spawnClaudeCodeWithContext, stopAgent } from './agent-spawner.js';
import { logger } from './logger.js';
import type { ClientMessage, ServerMessage } from './types.js';

const MAX_PAYLOAD_SIZE = 15 * 1024 * 1024;

export function handleClientMessage(ws: WebSocket, data: string): void {
  /** Check payload size before parsing to prevent DoS attacks */
  if (data.length > MAX_PAYLOAD_SIZE) {
    sendError(ws, undefined, 'Payload exceeds maximum size limit');
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(ws, undefined, `Invalid JSON: ${errorMessage}`);
    return;
  }

  const validation = ClientMessageSchema.safeParse(parsed);
  if (!validation.success) {
    const errorDetails = validation.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    sendError(ws, undefined, `Invalid message format: ${errorDetails}`);
    return;
  }

  const message: ClientMessage = validation.data;

  switch (message.type) {
    case 'start-agent':
      void handleStartAgent(ws, message);
      break;
    case 'start-agent-with-context':
      void handleStartAgentWithContext(ws, message);
      break;
    case 'stop-agent':
      handleStopAgent(ws, message);
      break;
    case 'list-agents':
      handleListAgents(ws);
      break;
    default:
      assertNever(message);
  }
}

async function handleStartAgent(
  ws: WebSocket,
  message: { type: 'start-agent'; taskId: string; prompt: string; cwd?: string }
): Promise<void> {
  const { taskId, prompt, cwd = `/tmp/shipyard-${taskId}` } = message;

  try {
    const child = await spawnClaudeCode({ taskId, prompt, cwd });

    child.once('error', (err) => {
      logger.error({ taskId, err }, 'Spawn error');
      sendError(ws, taskId, `Failed to spawn Claude Code: ${err.message}`);
    });

    if (!child.pid) {
      logger.error({ taskId }, 'No PID - spawn likely failed');
      sendError(ws, taskId, 'Failed to spawn Claude Code process - no PID returned');
      return;
    }

    send(ws, { type: 'started', taskId, pid: child.pid });
    attachOutputHandlers(ws, taskId, child);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, err }, 'Exception during spawn');
    sendError(ws, taskId, `Failed to start agent: ${errorMessage}`);
  }
}

function handleStopAgent(ws: WebSocket, message: { type: 'stop-agent'; taskId: string }): void {
  const { taskId } = message;

  const stopped = stopAgent(taskId);
  if (stopped) {
    send(ws, { type: 'stopped', taskId });
  } else {
    sendError(ws, taskId, 'No agent found for task');
  }
}

function handleListAgents(ws: WebSocket): void {
  const agents = listAgents();
  send(ws, { type: 'agents', list: agents });
}

async function handleStartAgentWithContext(
  ws: WebSocket,
  message: { type: 'start-agent-with-context'; taskId: string; cwd?: string; a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta } }
): Promise<void> {
  const { taskId, cwd = `/tmp/shipyard-${taskId}`, a2aPayload } = message;

  try {
    const { child, sessionId } = await spawnClaudeCodeWithContext({
      taskId,
      cwd,
      a2aPayload: {
        messages: a2aPayload.messages,
        meta: a2aPayload.meta,
      },
    });

    child.once('error', (err) => {
      logger.error({ taskId, err }, 'Spawn error');
      sendError(ws, taskId, `Failed to spawn Claude Code: ${err.message}`);
    });

    if (!child.pid) {
      logger.error({ taskId }, 'No PID - spawn likely failed');
      sendError(ws, taskId, 'Failed to spawn Claude Code process with context - no PID returned');
      return;
    }

    send(ws, { type: 'started', taskId, pid: child.pid, sessionId });
    attachOutputHandlers(ws, taskId, child);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ taskId, err }, 'Exception during spawn');
    sendError(ws, taskId, `Failed to start agent with context: ${errorMessage}`);
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, taskId: string | undefined, message: string): void {
  logger.error({ taskId: taskId ?? 'unknown', message }, 'Error for task');
  send(ws, { type: 'error', taskId, message });
}

function attachOutputHandlers(ws: WebSocket, taskId: string, child: ChildProcess): void {
  child.stdout?.on('data', (data: Buffer) => {
    send(ws, {
      type: 'output',
      taskId,
      data: data.toString('utf-8'),
      stream: 'stdout',
    });
  });

  child.stderr?.on('data', (data: Buffer) => {
    send(ws, {
      type: 'output',
      taskId,
      data: data.toString('utf-8'),
      stream: 'stderr',
    });
  });

  child.once('exit', (code) => {
    send(ws, {
      type: 'completed',
      taskId,
      exitCode: code ?? -1,
    });
  });
}
