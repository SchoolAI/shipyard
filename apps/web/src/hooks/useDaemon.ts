/**
 * Hook to manage WebSocket connection to the daemon server.
 * Provides interface for starting/stopping agents and monitoring their status.
 *
 * Protocol matches types defined in @shipyard/schema/daemon-types
 */

import type { A2AMessage, ClientMessage, ConversationExportMeta } from '@shipyard/schema';
import { type ServerMessage, ServerMessageSchema } from '@shipyard/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { daemonConfig } from '@/config/daemon';

interface DaemonState {
  connected: boolean;
  agents: Array<{ taskId: string; pid: number }>;
  lastError: string | null;
  lastStarted: { taskId: string; pid: number; sessionId?: string } | null;
}

/**
 * Callback for handling agent start events.
 * Used for P2P agent launching to notify when an agent starts or fails.
 */
export type AgentStartCallback = (
  taskId: string,
  result: { success: true; pid: number; sessionId?: string } | { success: false; error: string }
) => void;

interface UseDaemonReturn extends DaemonState {
  startAgent: (taskId: string, prompt: string, cwd?: string) => void;
  startAgentWithContext: (
    taskId: string,
    a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta },
    cwd?: string
  ) => void;
  stopAgent: (taskId: string) => void;
  /**
   * Register a callback for when a specific agent starts or fails.
   * Used for P2P agent launching to track pending requests.
   * Returns a cleanup function.
   */
  onAgentStart: (taskId: string, callback: AgentStartCallback) => () => void;
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
  const startCallbacksRef = useRef<Map<string, AgentStartCallback>>(new Map());

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'started': {
        setState((prev) => ({
          ...prev,
          agents: [...prev.agents, { taskId: message.taskId, pid: message.pid }],
          lastStarted: { taskId: message.taskId, pid: message.pid, sessionId: message.sessionId },
          lastError: null,
        }));
        const startCallback = startCallbacksRef.current.get(message.taskId);
        if (startCallback) {
          startCallback(message.taskId, {
            success: true,
            pid: message.pid,
            sessionId: message.sessionId,
          });
          startCallbacksRef.current.delete(message.taskId);
        }
        break;
      }

      case 'output':
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
        if (message.taskId) {
          const errorCallback = startCallbacksRef.current.get(message.taskId);
          if (errorCallback) {
            errorCallback(message.taskId, { success: false, error: message.message });
            startCallbacksRef.current.delete(message.taskId);
          }
        }
        break;

      default: {
        const _exhaustive: never = message;
        throw new Error(`Unhandled message type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }, []);

  useEffect(() => {
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return;

      try {
        const ws = new WebSocket(DAEMON_WS_URL);

        ws.onopen = () => {
          if (isCleanedUp) return;
          setState((prev) => ({ ...prev, connected: true }));
          ws.send(JSON.stringify({ type: 'list-agents' } satisfies ClientMessage));
        };

        ws.onmessage = (event) => {
          if (isCleanedUp) return;
          try {
            const parsed: unknown = JSON.parse(event.data);
            const result = ServerMessageSchema.safeParse(parsed);
            if (result.success) {
              handleServerMessage(result.data);
            }
          } catch {}
        };

        ws.onerror = () => {};

        ws.onclose = () => {
          if (isCleanedUp) return;
          setState((prev) => ({ ...prev, connected: false }));

          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, DAEMON_RECONNECT_INTERVAL_MS);
        };

        wsRef.current = ws;
      } catch {
        if (isCleanedUp) return;
        reconnectTimeoutRef.current = window.setTimeout(connect, DAEMON_RECONNECT_INTERVAL_MS);
      }
    };

    connect();

    return () => {
      isCleanedUp = true;

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

  /**
   * Register a callback for when a specific agent starts or fails.
   * Used for P2P agent launching to track pending requests.
   */
  const onAgentStart = useCallback((taskId: string, callback: AgentStartCallback): (() => void) => {
    startCallbacksRef.current.set(taskId, callback);
    return () => {
      startCallbacksRef.current.delete(taskId);
    };
  }, []);

  return {
    ...state,
    startAgent,
    startAgentWithContext,
    stopAgent,
    onAgentStart,
  };
}
