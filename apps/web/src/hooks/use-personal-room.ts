import {
  type AgentInfo,
  type ConnectionState,
  PersonalRoomConnection,
  type PersonalRoomServerMessage,
} from '@shipyard/session';
import { useEffect, useState } from 'react';
import { assertNever } from '../utils/assert-never';

export type TaskAck = Extract<PersonalRoomServerMessage, { type: 'task-ack' }>;
export type { AgentInfo, ConnectionState };

interface PersonalRoomConfig {
  url: string;
}

export function usePersonalRoom(config: PersonalRoomConfig | null) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connection, setConnection] = useState<PersonalRoomConnection | null>(null);
  const [lastTaskAck, setLastTaskAck] = useState<TaskAck | null>(null);

  useEffect(() => {
    if (!config) {
      setAgents([]);
      setConnectionState('disconnected');
      setConnection(null);
      setLastTaskAck(null);
      return;
    }

    setLastTaskAck(null);

    const conn = new PersonalRoomConnection({ url: config.url });
    setConnection(conn);

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
        case 'authenticated':
        case 'notify-task':
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice':
        case 'enhance-prompt-request':
        case 'enhance-prompt-chunk':
        case 'enhance-prompt-done':
          break;
        default:
          assertNever(msg);
      }
    });

    const unsubState = conn.onStateChange((state) => {
      setConnectionState(state);
    });

    conn.connect();

    return () => {
      unsubMessage();
      unsubState();
      conn.disconnect();
      setConnection(null);
    };
  }, [config?.url]);

  return { agents, connectionState, connection, lastTaskAck };
}
