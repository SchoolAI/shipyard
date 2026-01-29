/**
 * WebSocket message protocol handler
 *
 * Handles messages between browser clients and daemon.
 * Delegates to agent-spawner for process management.
 */

import type { WebSocket } from 'ws';
import type { A2AMessage, ConversationExportMeta } from '@shipyard/schema';
import { assertNever } from '@shipyard/schema';
import { listAgents, spawnClaudeCode, spawnClaudeCodeWithContext, stopAgent } from './agent-spawner.js';
import type { ClientMessage, ServerMessage } from './types.js';

const MAX_PAYLOAD_SIZE = 15 * 1024 * 1024; // 15MB

export function handleClientMessage(ws: WebSocket, data: string): void {
  // Check payload size before parsing to prevent DoS attacks
  if (data.length > MAX_PAYLOAD_SIZE) {
    sendError(ws, undefined, 'Payload exceeds maximum size limit');
    return;
  }

  try {
    const message: ClientMessage = JSON.parse(data);

    switch (message.type) {
      case 'start-agent':
        handleStartAgent(ws, message);
        break;
      case 'start-agent-with-context':
        handleStartAgentWithContext(ws, message);
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
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(ws, undefined, `Failed to parse message: ${errorMessage}`);
  }
}

function handleStartAgent(
  ws: WebSocket,
  message: { type: 'start-agent'; taskId: string; prompt: string; cwd?: string }
): void {
  const { taskId, prompt, cwd = process.cwd() } = message;

  try {
    const child = spawnClaudeCode({ taskId, prompt, cwd });

    if (!child.pid) {
      sendError(ws, taskId, 'Failed to spawn Claude Code process');
      return;
    }

    /** Send started event */
    send(ws, { type: 'started', taskId, pid: child.pid });

    /** Stream stdout */
    child.stdout?.on('data', (data: Buffer) => {
      send(ws, {
        type: 'output',
        taskId,
        data: data.toString('utf-8'),
        stream: 'stdout',
      });
    });

    /** Stream stderr */
    child.stderr?.on('data', (data: Buffer) => {
      send(ws, {
        type: 'output',
        taskId,
        data: data.toString('utf-8'),
        stream: 'stderr',
      });
    });

    /** Send completion event */
    child.once('exit', (code) => {
      send(ws, {
        type: 'completed',
        taskId,
        exitCode: code ?? -1,
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
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
  message: { type: 'start-agent-with-context'; taskId: string; cwd: string; a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta } }
): Promise<void> {
  const { taskId, cwd, a2aPayload } = message;

  try {
    const { child, sessionId } = await spawnClaudeCodeWithContext({
      taskId,
      cwd,
      a2aPayload: {
        messages: a2aPayload.messages,
        meta: a2aPayload.meta,
      },
    });

    if (!child.pid) {
      sendError(ws, taskId, 'Failed to spawn Claude Code process with context');
      return;
    }

    /** Send started event */
    send(ws, { type: 'started', taskId, pid: child.pid, sessionId });

    /** Stream stdout */
    child.stdout?.on('data', (data: Buffer) => {
      send(ws, {
        type: 'output',
        taskId,
        data: data.toString('utf-8'),
        stream: 'stdout',
      });
    });

    /** Stream stderr */
    child.stderr?.on('data', (data: Buffer) => {
      send(ws, {
        type: 'output',
        taskId,
        data: data.toString('utf-8'),
        stream: 'stderr',
      });
    });

    /** Send completion event */
    child.once('exit', (code) => {
      send(ws, {
        type: 'completed',
        taskId,
        exitCode: code ?? -1,
      });
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(ws, taskId, `Failed to start agent with context: ${errorMessage}`);
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, taskId: string | undefined, message: string): void {
  console.error(`Error for task ${taskId ?? 'unknown'}:`, message);
  send(ws, { type: 'error', taskId, message });
}
