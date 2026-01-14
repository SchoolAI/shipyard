import {
  getApprovedUsers,
  getPlanOwnerId,
  getRejectedUsers,
  isUserApproved,
  isUserRejected,
} from '@peer-plan/schema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { useGitHubAuth } from './useGitHubAuth';

const DEFAULT_SIGNALING_SERVER = 'wss://peer-plan-signaling.jacob-191.workers.dev';

// Single hub URL - replaces multi-provider discovery
const DEFAULT_HUB_URL = 'ws://localhost:32191';

/**
 * Generate a deterministic color from a string (e.g., username).
 * Uses a simple hash to pick a hue for consistent colors per user.
 */
function colorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PlanAwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  status: ApprovalStatus;
  isOwner: boolean;
  requestedAt?: number;
  /**
   * WebRTC peerId (UUID) for P2P transfers.
   * This is different from the awareness clientID (number).
   * The webrtcPeerId is used as the key in room.webrtcConns.
   */
  webrtcPeerId?: string;
}

export interface SyncState {
  /** Connected to hub WebSocket or WebRTC peers */
  connected: boolean;
  /** Hub WebSocket has completed initial sync */
  synced: boolean;
  /** Number of peers connected via WebRTC P2P */
  peerCount: number;
  /** Whether IndexedDB has synced (local data available) */
  idbSynced: boolean;
  /** User's approval status for this plan (undefined if approval not required) */
  approvalStatus?: ApprovalStatus;
}

/**
 * Hook for connecting to a single Registry Hub for Yjs sync.
 * Also manages IndexedDB persistence and WebRTC P2P sync.
 *
 * @param docName - Document name (plan ID or 'plan-index')
 * @param options - Optional configuration
 * @param options.enableWebRTC - Enable P2P WebRTC sync (default: true for plan docs, false for plan-index)
 */
export function useMultiProviderSync(
  docName: string,
  options: { enableWebRTC?: boolean } = {}
): {
  ydoc: Y.Doc;
  syncState: SyncState;
  /** WebSocket provider to hub (null if not connected) */
  wsProvider: WebsocketProvider | null;
  /** WebRTC provider for P2P sync (null if not connected) */
  rtcProvider: WebrtcProvider | null;
} {
  // Don't enable WebRTC for plan-index (only for individual plans)
  const enableWebRTC = options.enableWebRTC ?? docName !== 'plan-index';
  const { identity: githubIdentity } = useGitHubAuth();
  // biome-ignore lint/correctness/useExhaustiveDependencies: docName triggers Y.Doc recreation intentionally
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    synced: false,
    peerCount: 0,
    idbSynced: false,
  });
  const idbSyncedRef = useRef(false);
  const approvalStatusRef = useRef<ApprovalStatus | undefined>(undefined);
  const [rtcProvider, setRtcProvider] = useState<WebrtcProvider | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);

  const peerCountRef = useRef<number>(0);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    let mounted = true;

    const idbProvider = new IndexeddbPersistence(docName, ydoc);

    // Track when IndexedDB has synced - this means local data is available
    idbProvider.whenSynced.then(() => {
      if (mounted) {
        idbSyncedRef.current = true;
        updateSyncState();

        // Fire event so useSharedPlans can discover newly synced plans
        // Only fire for plan documents (not plan-index)
        if (docName !== 'plan-index') {
          window.dispatchEvent(
            new CustomEvent('indexeddb-plan-synced', { detail: { planId: docName } })
          );
        }
      }
    });

    // Connect to single Registry Hub
    const hubUrl = (import.meta.env.VITE_HUB_URL as string) || DEFAULT_HUB_URL;
    const ws = new WebsocketProvider(hubUrl, docName, ydoc, {
      connect: true,
      maxBackoffTime: 2500,
    });

    wsProviderRef.current = ws;
    setWsProvider(ws);

    ws.on('status', () => {
      if (mounted) updateSyncState();
    });

    ws.on('sync', () => {
      if (mounted) updateSyncState();
    });

    let rtc: WebrtcProvider | null = null;
    let handleBeforeUnload: (() => void) | null = null;

    if (enableWebRTC) {
      const signalingServer =
        (import.meta.env.VITE_WEBRTC_SIGNALING as string) || DEFAULT_SIGNALING_SERVER;

      rtc = new WebrtcProvider(`peer-plan-${docName}`, ydoc, {
        signaling: [signalingServer],
      });
      setRtcProvider(rtc);

      // Use awareness protocol for peer counting instead of raw WebRTC connections.
      // The awareness protocol has a heartbeat/timeout mechanism that properly detects
      // disconnected peers, unlike raw WebRTC connections which can stay "open" after
      // a page refresh until ICE connectivity checks fail (15-30+ seconds).
      const awareness = rtc.awareness;

      // Count peers from awareness states (excluding self)
      const updatePeerCountFromAwareness = () => {
        const states = awareness.getStates();
        // Count peers excluding ourselves
        const peerCount = states.size - 1;
        peerCountRef.current = Math.max(0, peerCount);
        if (mounted) {
          updateSyncState();
        }
      };

      // Listen for awareness changes (peers joining/leaving)
      awareness.on('change', updatePeerCountFromAwareness);

      // Initial count
      updatePeerCountFromAwareness();

      // Track sync state
      rtc.on('synced', () => {
        if (mounted) {
          updateSyncState();
        }
      });

      // Clear awareness on page unload so other peers see us leave immediately
      // instead of waiting for the 30-second awareness timeout
      handleBeforeUnload = () => {
        awareness.setLocalState(null);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    function computeApprovalStatus(userId: string | undefined): ApprovalStatus | undefined {
      const ownerId = getPlanOwnerId(ydoc);

      if (!ownerId) return undefined;

      // User not authenticated yet - they need to auth to view this plan
      if (!userId) return 'pending';

      // Check rejection first (rejected takes precedence)
      if (isUserRejected(ydoc, userId)) return 'rejected';

      return isUserApproved(ydoc, userId) ? 'approved' : 'pending';
    }

    function setLocalAwarenessState() {
      if (!rtc || !githubIdentity) return;

      const ownerId = getPlanOwnerId(ydoc);
      const status = computeApprovalStatus(githubIdentity.username);

      // Only set awareness for plans with approval (not plan-index)
      if (status === undefined) return;

      // Get WebRTC peerId from the room (may be undefined if room not initialized yet)
      const webrtcPeerId = (rtc as unknown as { room?: { peerId?: string } }).room?.peerId;

      const awarenessState: PlanAwarenessState = {
        user: {
          id: githubIdentity.username,
          name: githubIdentity.displayName,
          color: colorFromString(githubIdentity.username),
        },
        status,
        isOwner: ownerId === githubIdentity.username,
        requestedAt: status === 'pending' ? Date.now() : undefined,
        // Include WebRTC peerId for P2P transfers (used as key in room.webrtcConns)
        webrtcPeerId,
      };

      rtc.awareness.setLocalStateField('planStatus', awarenessState);
    }

    function updateApprovalStatus() {
      const newStatus = computeApprovalStatus(githubIdentity?.username);
      if (newStatus !== approvalStatusRef.current) {
        approvalStatusRef.current = newStatus;
        setLocalAwarenessState();
        updateSyncState();
      }
    }

    /**
     * Send user identity to signaling server for access control.
     * This allows the server to track which user is on which connection.
     */
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Simple iteration over connections
    function sendUserIdentityToSignaling() {
      if (!rtc || !githubIdentity) return;

      const identifyMessage = JSON.stringify({
        type: 'subscribe',
        topics: [], // Empty topics - just updating userId
        userId: githubIdentity.username,
      });

      // Send to all connected signaling connections
      const signalingConns = (rtc as unknown as { signalingConns: Array<{ ws: WebSocket }> })
        .signalingConns;

      if (signalingConns) {
        for (const conn of signalingConns) {
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(identifyMessage);
          }
        }
      }
    }

    /**
     * Push approval state to signaling server (owner only).
     * This allows the signaling server to gate peer discovery for unapproved users.
     */
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Simple iteration over connections
    function pushApprovalStateToSignaling() {
      if (!rtc || !githubIdentity) return;

      const ownerId = getPlanOwnerId(ydoc);
      // Only owner pushes approval state
      if (!ownerId || ownerId !== githubIdentity.username) return;

      const approvedUsers = getApprovedUsers(ydoc);
      const rejectedUsers = getRejectedUsers(ydoc);

      const approvalStateMessage = JSON.stringify({
        type: 'approval_state',
        planId: docName,
        ownerId,
        approvedUsers,
        rejectedUsers,
      });

      // Send to all connected signaling connections
      // y-webrtc's signalingConns is an array of SignalingConn objects
      const signalingConns = (rtc as unknown as { signalingConns: Array<{ ws: WebSocket }> })
        .signalingConns;

      if (signalingConns) {
        for (const conn of signalingConns) {
          if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(approvalStateMessage);
          }
        }
      }
    }

    // Watch for metadata changes (e.g., when owner approves user)
    const metadataMap = ydoc.getMap('metadata');

    function handleMetadataChange() {
      updateApprovalStatus();
      pushApprovalStateToSignaling();
    }

    metadataMap.observe(handleMetadataChange);

    // Set initial awareness state when GitHub identity is available
    if (githubIdentity && rtc) {
      updateApprovalStatus();
      // Send user identity and approval state immediately
      // No delay - we need this before any WebRTC messages are relayed
      sendUserIdentityToSignaling();
      pushApprovalStateToSignaling();
    }

    function updateSyncState() {
      const wsConnected = wsProviderRef.current?.wsconnected ?? false;
      const wsSynced = wsProviderRef.current?.synced ?? false;
      const anyConnected = wsConnected || (rtc?.connected ?? false);

      setSyncState({
        connected: anyConnected,
        synced: wsSynced,
        peerCount: peerCountRef.current,
        idbSynced: idbSyncedRef.current,
        approvalStatus: approvalStatusRef.current,
      });
    }

    return () => {
      mounted = false;
      ws.disconnect();
      ws.destroy();
      wsProviderRef.current = null;
      setWsProvider(null);
      metadataMap.unobserve(handleMetadataChange);
      idbProvider.destroy();
      if (rtc) {
        // Clear awareness before destroying so other peers see us leave
        rtc.awareness.setLocalState(null);
        rtc.disconnect();
        rtc.destroy();
        setRtcProvider(null);
      }
      if (handleBeforeUnload) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [docName, ydoc, enableWebRTC, githubIdentity]);

  return { ydoc, syncState, wsProvider, rtcProvider };
}
