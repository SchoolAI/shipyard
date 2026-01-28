/**
 * WebSocket message protocol handler
 *
 * Handles messages between browser clients and daemon.
 * Delegates to agent-spawner for process management.
 */

import type { WebSocket } from 'ws';
import { listAgents, spawnClaudeCode, stopAgent } from './agent-spawner.js';
import type { ClientMessage, ServerMessage } from './types.js';

/**
 * Handles incoming WebSocket messages from clients.
 * Parses the message and dispatches to appropriate handler.
 */
export function handleClientMessage(ws: WebSocket, data: string): void {
  try {
    const message: ClientMessage = JSON.parse(data);

    switch (message.type) {
      case 'start-agent':
        handleStartAgent(ws, message);
        break;
      case 'stop-agent':
        handleStopAgent(ws, message);
        break;
      case 'list-agents':
        handleListAgents(ws);
        break;
      default:
        sendError(ws, undefined, `Unknown message type: ${(message as { type: string }).type}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(ws, undefined, `Failed to parse message: ${errorMessage}`);
  }
}

/**
 * Handles start-agent message.
 * Spawns Claude Code and streams output to client.
 */
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

/**
 * Handles stop-agent message.
 * Kills the running Claude Code process.
 */
function handleStopAgent(ws: WebSocket, message: { type: 'stop-agent'; taskId: string }): void {
  const { taskId } = message;

  const stopped = stopAgent(taskId);
  if (stopped) {
    send(ws, { type: 'stopped', taskId });
  } else {
    sendError(ws, taskId, 'No agent found for task');
  }
}

/**
 * Handles list-agents message.
 * Returns all active agents.
 */
function handleListAgents(ws: WebSocket): void {
  const agents = listAgents();
  send(ws, { type: 'agents', list: agents });
}

/**
 * Sends a message to the WebSocket client.
 */
function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Sends an error message to the WebSocket client.
 */
function sendError(ws: WebSocket, taskId: string | undefined, message: string): void {
  console.error(`Error for task ${taskId ?? 'unknown'}:`, message);
  send(ws, { type: 'error', taskId, message });
}
