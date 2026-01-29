/**
 * Hook to manage WebSocket connection to the daemon server.
 * Provides interface for starting/stopping agents and monitoring their status.
 *
 * Protocol matches types defined in @shipyard/schema/daemon-types
 */

import type {
  A2AMessage,
  ClientMessage,
  ConversationExportMeta,
  ServerMessage,
} from '@shipyard/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { daemonConfig } from '@/config/daemon';

interface DaemonState {
  connected: boolean;
  agents: Array<{ taskId: string; pid: number }>;
  lastError: string | null;
  lastStarted: { taskId: string; pid: number; sessionId?: string } | null;
}

interface UseDaemonReturn extends DaemonState {
  startAgent: (taskId: string, prompt: string, cwd?: string) => void;
  startAgentWithContext: (
    taskId: string,
    a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta },
    cwd?: string
  ) => void;
  stopAgent: (taskId: string) => void;
}

const { DAEMON_WS_URL, DAEMON_RECONNECT_INTERVAL_MS } = daemonConfig;

/**
 * Hook that manages WebSocket connection to the daemon server.
 * Automatically reconnects on disconnect.
 *
 * @returns Connection state and agent management functions
 */
export function useDaemon(): UseDaemonReturn {
  const [state, setState] = useState<DaemonState>({
    connected: false,
    agents: [],
    lastError: null,
    lastStarted: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'started':
        setState((prev) => ({
          ...prev,
          agents: [...prev.agents, { taskId: message.taskId, pid: message.pid }],
          lastStarted: { taskId: message.taskId, pid: message.pid, sessionId: message.sessionId },
        }));
        break;

      case 'output':
        // Output messages are received but not displayed
        break;

      case 'completed':
        setState((prev) => ({
          ...prev,
          agents: prev.agents.filter((a) => a.taskId !== message.taskId),
        }));
        break;

      case 'stopped':
        setState((prev) => ({
          ...prev,
          agents: prev.agents.filter((a) => a.taskId !== message.taskId),
        }));
        break;

      case 'agents':
        setState((prev) => ({ ...prev, agents: message.list }));
        break;

      case 'error':
        setState((prev) => ({
          ...prev,
          lastError: message.message,
        }));
        break;

      default: {
        const _exhaustive: never = message;
        throw new Error(`Unhandled message type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }, []);

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(DAEMON_WS_URL);

        ws.onopen = () => {
          setState((prev) => ({ ...prev, connected: true }));
          ws.send(JSON.stringify({ type: 'list-agents' } satisfies ClientMessage));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as ServerMessage;
            handleServerMessage(message);
          } catch {
            // Silently ignore malformed messages
          }
        };

        ws.onerror = () => {
          // Connection errors are handled by onclose
        };

        ws.onclose = () => {
          setState((prev) => ({ ...prev, connected: false }));

          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, DAEMON_RECONNECT_INTERVAL_MS);
        };

        wsRef.current = ws;
      } catch {
        // Retry connection on error
        reconnectTimeoutRef.current = window.setTimeout(connect, DAEMON_RECONNECT_INTERVAL_MS);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [handleServerMessage]);

  const startAgent = (taskId: string, prompt: string, cwd?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: ClientMessage = {
      type: 'start-agent',
      taskId,
      prompt,
      cwd,
    };

    wsRef.current.send(JSON.stringify(message));
  };

  const startAgentWithContext = (
    taskId: string,
    a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta },
    cwd?: string
  ) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: ClientMessage = {
      type: 'start-agent-with-context',
      taskId,
      cwd: cwd ?? '/tmp',
      a2aPayload,
    };

    wsRef.current.send(JSON.stringify(message));
  };

  const stopAgent = (taskId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: ClientMessage = {
      type: 'stop-agent',
      taskId,
    };

    wsRef.current.send(JSON.stringify(message));
  };

  return {
    ...state,
    startAgent,
    startAgentWithContext,
    stopAgent,
  };
}
