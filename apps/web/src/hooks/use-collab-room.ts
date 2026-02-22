import {
  CollabRoomConnection,
  type CollabRoomServerMessage,
  type ConnectionState,
  type Participant,
} from '@shipyard/session';
import { useEffect, useState } from 'react';
import { assertNever } from '../utils/assert-never';

export type { ConnectionState, Participant };

interface CollabRoomConfig {
  url: string;
}

export function useCollabRoom(config: CollabRoomConfig | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [connection, setConnection] = useState<CollabRoomConnection | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      setParticipants([]);
      setConnectionState('disconnected');
      setConnection(null);
      setTaskId(null);
      setCurrentUserId(null);
      return;
    }

    setTaskId(null);
    setCurrentUserId(null);

    const conn = new CollabRoomConnection({
      url: config.url,
      maxRetries: -1,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    });
    setConnection(conn);

    let currentState: ConnectionState = 'disconnected';

    const unsubMessage = conn.onMessage((msg: CollabRoomServerMessage) => {
      switch (msg.type) {
        case 'authenticated':
          setTaskId(msg.taskId);
          setCurrentUserId(msg.userId);
          break;
        case 'participants-list':
          setParticipants(msg.participants);
          break;
        case 'participant-joined':
          setParticipants((prev) =>
            prev.some((p) => p.userId === msg.participant.userId)
              ? prev
              : [...prev, msg.participant]
          );
          break;
        case 'participant-left':
          setParticipants((prev) => prev.filter((p) => p.userId !== msg.userId));
          break;
        case 'error':
          break;
        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice':
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

  return { participants, connectionState, connection, taskId, currentUserId };
}
