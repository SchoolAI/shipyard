import {
  type AgentInfo,
  type ConnectionState,
  PersonalRoomConnection,
  type PersonalRoomServerMessage,
} from '@shipyard/session';
import { useEffect, useState } from 'react';
import { assertNever } from '../utils/assert-never';

export type TaskAck = Extract<PersonalRoomServerMessage, { type: 'task-ack' }>;
export type ControlAck = Extract<PersonalRoomServerMessage, { type: 'control-ack' }>;
export type { AgentInfo, ConnectionState };

interface PersonalRoomConfig {
  url: string;
}

export function usePersonalRoom(config: PersonalRoomConfig | null) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connection, setConnection] = useState<PersonalRoomConnection | null>(null);
  const [lastTaskAck, setLastTaskAck] = useState<TaskAck | null>(null);
  const [lastControlAck, setLastControlAck] = useState<ControlAck | null>(null);

  useEffect(() => {
    if (!config) {
      setAgents([]);
      setConnectionState('disconnected');
      setConnection(null);
      setLastTaskAck(null);
      setLastControlAck(null);
      return;
    }

    setLastTaskAck(null);
    setLastControlAck(null);

    const conn = new PersonalRoomConnection({
      url: config.url,
      maxRetries: -1,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    });
    setConnection(conn);

    let currentState: ConnectionState = 'disconnected';

    const unsubMessage = conn.onMessage((msg: PersonalRoomServerMessage) => {
      switch (msg.type) {
        case 'agents-list':
          setAgents(msg.agents);
          break;
        case 'agent-joined':
          setAgents((prev) =>
            prev.some((a) => a.agentId === msg.agent.agentId) ? prev : [...prev, msg.agent]
          );
          break;
        case 'agent-left':
          setAgents((prev) => prev.filter((a) => a.agentId !== msg.agentId));
          break;
        case 'agent-status-changed':
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === msg.agentId
                ? { ...a, status: msg.status, activeTaskId: msg.activeTaskId }
                : a
            )
          );
          break;
        case 'error':
          break;
        case 'task-ack':
          setLastTaskAck(msg);
          break;
        case 'control-ack':
          setLastControlAck(msg);
          break;
        case 'authenticated':
        case 'notify-task':
        case 'cancel-task':
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice':
        case 'enhance-prompt-request':
        case 'enhance-prompt-chunk':
        case 'enhance-prompt-done':
        case 'worktree-create-request':
        case 'worktree-create-progress':
        case 'worktree-create-done':
        case 'worktree-create-error':
          break;
        default:
          assertNever(msg);
      }
    });

    const unsubState = conn.onStateChange((state) => {
      currentState = state;
      setConnectionState(state);
    });

    conn.connect();

    const handleVisibilityChange = () => {
      if (!document.hidden && (currentState === 'disconnected' || currentState === 'error')) {
        conn.connect();
      }
    };

    const handleOnline = () => {
      if (currentState === 'disconnected' || currentState === 'error') {
        conn.connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      unsubMessage();
      unsubState();
      conn.disconnect();
      setConnection(null);
    };
  }, [config?.url]);

  return { agents, connectionState, connection, lastTaskAck, lastControlAck };
}
