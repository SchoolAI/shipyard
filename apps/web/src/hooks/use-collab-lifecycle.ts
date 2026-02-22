import type { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { ConnectionState, Participant } from '@shipyard/session';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLLAB_SESSION_KEY } from '../utils/url-sync';
import { useCollabRoom } from './use-collab-room';
import { useCollabWebRTCSync } from './use-collab-webrtc-sync';

export type { ConnectionState, Participant };

export type CollabRole = 'owner' | 'collaborator-full' | 'collaborator-review' | 'viewer';

export interface CollabLifecycleResult {
  participants: Participant[];
  connectionState: ConnectionState;
  connection: ReturnType<typeof useCollabRoom>['connection'];
  taskId: string | null;
  currentUserId: string | null;
  role: CollabRole | null;
  isOwner: boolean;
  isReadOnly: boolean;
  /** True when the user is connected to a collab room and has no personal room daemon. */
  isCollabMode: boolean;
  /** Join a collab room by WS URL. Called from share modal (owner) or URL detection (collaborator). */
  join: (wsUrl: string) => void;
  /** Leave the current collab session. Clears URL, sessionStorage, and task activation. */
  leave: () => void;
}

interface UseCollabLifecycleProps {
  authToken: string | null;
  activeTaskId: string | null;
  setActiveTask: (id: string | null) => void;
  collabAdapter: WebRtcDataChannelAdapter | null;
  sharedTaskIds: Set<string>;
  /** Whether the personal room has a connected machine (used to determine isCollabMode). */
  hasPersonalConnection: boolean;
}

/** Build the WebSocket URL for a collab room from the current page URL. */
function buildCollabWsUrl(authToken: string | null): string | null {
  const params = new URLSearchParams(window.location.search);
  const collabToken = params.get('token');
  const roomId = window.location.pathname.match(/^\/collab\/(.+)/)?.[1];
  if (!roomId || !collabToken) return null;

  const base = import.meta.env.VITE_SESSION_SERVER_URL;
  if (typeof base !== 'string' || base.length === 0) return null;

  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const userToken = authToken ? `&userToken=${encodeURIComponent(authToken)}` : '';
  return `${wsBase}/collab/${encodeURIComponent(roomId)}?token=${encodeURIComponent(collabToken)}${userToken}`;
}

const COLLAB_ROLES: Record<string, CollabRole> = {
  owner: 'owner',
  'collaborator-full': 'collaborator-full',
  'collaborator-review': 'collaborator-review',
  viewer: 'viewer',
};

function toCollabRole(value: string | undefined): CollabRole | null {
  if (!value) return null;
  return COLLAB_ROLES[value] ?? null;
}

/**
 * Single hook that manages the entire collab room lifecycle.
 *
 * Replaces 7+ scattered effects in chat-page.tsx with a clear sequence:
 * 1. URL detection or explicit join() call sets the WS URL
 * 2. useCollabRoom connects and authenticates → taskId, participants
 * 3. Task is activated in the task store
 * 4. sharedTaskIds is populated for the owner's visibility filter
 * 5. useCollabWebRTCSync establishes WebRTC peers for Loro sync
 * 6. leave() tears everything down cleanly
 */
export function useCollabLifecycle(props: UseCollabLifecycleProps): CollabLifecycleResult {
  const {
    authToken,
    activeTaskId,
    setActiveTask,
    collabAdapter,
    sharedTaskIds,
    hasPersonalConnection,
  } = props;

  const [collabRoomUrl, setCollabRoomUrl] = useState<string | null>(null);
  const intentionalLeaveRef = useRef(false);

  const join = useCallback((wsUrl: string) => {
    intentionalLeaveRef.current = false;
    setCollabRoomUrl(wsUrl);
    sessionStorage.setItem(COLLAB_SESSION_KEY, wsUrl);
  }, []);

  const leave = useCallback(() => {
    intentionalLeaveRef.current = true;
    setCollabRoomUrl(null);
    sessionStorage.removeItem(COLLAB_SESSION_KEY);
    sharedTaskIds.clear();
  }, [sharedTaskIds]);

  const collabRoomConfig = collabRoomUrl ? { url: collabRoomUrl } : null;
  const {
    participants,
    connectionState,
    connection,
    taskId: collabTaskId,
    currentUserId,
  } = useCollabRoom(collabRoomConfig);

  const currentParticipant = participants.find((p) => p.userId === currentUserId);
  const role = toCollabRole(currentParticipant?.role);
  const isOwner = role === 'owner';
  const isReadOnly = role === 'viewer' || role === 'collaborator-review';
  const isCollabMode = connectionState === 'connected' && !!collabTaskId && !hasPersonalConnection;

  /**
   * Populate sharedTaskIds SYNCHRONOUSLY before WebRTC setup.
   * This MUST happen before useCollabWebRTCSync so that when the data
   * channel opens and the owner's Repo checks visibility, the task docs
   * are already in the Set. Using useEffect would be too late — the
   * WebRTC handshake can complete before effects run.
   */
  if (collabTaskId) {
    sharedTaskIds.add(collabTaskId);
  }
  if (activeTaskId && collabRoomUrl) {
    sharedTaskIds.add(activeTaskId);
  }

  useCollabWebRTCSync({
    connection,
    collabAdapter,
    connectionState,
    currentUserId,
    initialParticipants: participants,
  });

  useEffect(() => {
    if (collabRoomUrl) return;
    if (intentionalLeaveRef.current) return;

    const wsUrl = buildCollabWsUrl(authToken);
    if (wsUrl) {
      join(wsUrl);
      return;
    }

    const persisted = sessionStorage.getItem(COLLAB_SESSION_KEY);
    if (persisted) {
      setCollabRoomUrl(persisted);
    }
  }, [authToken, collabRoomUrl, join]);

  useEffect(() => {
    if (!collabTaskId) return;
    if (intentionalLeaveRef.current) return;
    if (!collabRoomUrl) return;

    if (!activeTaskId || activeTaskId !== collabTaskId) {
      setActiveTask(collabTaskId);
    }
  }, [collabTaskId, activeTaskId, setActiveTask, collabRoomUrl]);

  const prevActiveTaskIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const wasSet =
      prevActiveTaskIdRef.current !== undefined && prevActiveTaskIdRef.current !== null;
    prevActiveTaskIdRef.current = activeTaskId;

    if (wasSet && activeTaskId === null && collabRoomUrl) {
      leave();
    }
  }, [activeTaskId, collabRoomUrl, leave]);

  return {
    participants,
    connectionState,
    connection,
    taskId: collabTaskId,
    currentUserId,
    role,
    isOwner,
    isReadOnly,
    isCollabMode,
    join,
    leave,
  };
}
