import {
  type AgentInfo,
  type ConnectionState,
  PersonalRoomConnection,
  type PersonalRoomServerMessage,
} from '@shipyard/session';
import { useEffect, useState } from 'react';
import { assertNever } from '../utils/assert-never';

export type { AgentInfo, ConnectionState };

interface PersonalRoomConfig {
  url: string;
}

export function usePersonalRoom(config: PersonalRoomConfig | null) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    if (!config) {
      setAgents([]);
      setConnectionState('disconnected');
      return;
    }

    const conn = new PersonalRoomConnection({ url: config.url });

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
        case 'agent-capabilities-changed':
          setAgents((prev) =>
            prev.map((a) =>
              a.agentId === msg.agentId ? { ...a, capabilities: msg.capabilities } : a
            )
          );
          break;
        case 'error':
          break;
        case 'authenticated':
        case 'spawn-result':
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice':
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
    };
  }, [config?.url]);

  return { agents, connectionState };
}
