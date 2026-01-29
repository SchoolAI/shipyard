/**
 * Hook to manage WebSocket connection to the daemon server.
 * Provides interface for starting/stopping agents and monitoring their status.
 *
 * Protocol matches types defined in @shipyard/schema/daemon-types
 */

import type { ClientMessage, ServerMessage } from '@shipyard/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DaemonState {
  connected: boolean;
  agents: Array<{ taskId: string; pid: number }>;
}

interface UseDaemonReturn extends DaemonState {
  startAgent: (taskId: string, prompt: string, cwd?: string) => void;
  stopAgent: (taskId: string) => void;
}

const DAEMON_WS_URL = 'ws://localhost:56609';
const RECONNECT_INTERVAL_MS = 5000;

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
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'started':
        setState((prev) => ({
          ...prev,
          agents: [...prev.agents, { taskId: message.taskId, pid: message.pid }],
        }));
        break;

      case 'output':
        /** Output messages are logged by daemon, no UI display needed */
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
        /** Error messages shown via toast in daemon, no duplicate UI needed */
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
            /** Daemon protocol is trusted - validates via exhaustive switch */
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Daemon protocol trusted, validated by exhaustive switch
            const message = JSON.parse(event.data) as ServerMessage;
            handleServerMessage(message);
          } catch {
            /** Malformed JSON from daemon is non-fatal - silently skip */
          }
        };

        ws.onerror = () => {
          /** WebSocket fires onerror before onclose - reconnect logic is in onclose */
        };

        ws.onclose = () => {
          setState((prev) => ({ ...prev, connected: false }));

          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, RECONNECT_INTERVAL_MS);
        };

        wsRef.current = ws;
      } catch {
        /** WebSocket constructor can throw - schedule retry */
        reconnectTimeoutRef.current = window.setTimeout(connect, RECONNECT_INTERVAL_MS);
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
    stopAgent,
  };
}
