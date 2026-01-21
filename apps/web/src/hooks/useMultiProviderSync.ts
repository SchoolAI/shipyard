import {
  getApprovedUsers,
  getPlanOwnerId,
  getRejectedUsers,
  isUserApproved,
  isUserRejected,
  type OriginPlatform,
  type PlanMetadata,
  YDOC_KEYS,
} from '@shipyard/schema';
import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { useGitHubAuth } from './useGitHubAuth';

const DEFAULT_SIGNALING_SERVER = 'wss://shipyard-signaling.jacob-191.workers.dev';

/**
 * Discover the hub URL by checking registry endpoints.
 * Tries ports 32191 and 32192 to handle hub restarts.
 */
async function discoverHubUrl(): Promise<string> {
  const ports = import.meta.env.VITE_REGISTRY_PORT
    ? [Number.parseInt(import.meta.env.VITE_REGISTRY_PORT as string, 10)]
    : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return `ws://localhost:${port}`;
      }
    } catch {
      // Continue to next port
    }
  }

  // Fallback to default if discovery fails
  return `ws://localhost:${DEFAULT_REGISTRY_PORTS[0]}`;
}

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

export type PlanAwarenessState =
  | {
      status: 'pending';
      user: {
        id: string;
        name: string;
        color: string;
      };
      isOwner: boolean;
      requestedAt: number;
      /**
       * Platform type for this peer (browser, MCP server, etc.)
       * Used to distinguish between different types of participants.
       */
      platform?: OriginPlatform;
      /**
       * WebRTC peerId (UUID) for P2P transfers.
       * This is different from the awareness clientID (number).
       * The webrtcPeerId is used as the key in room.webrtcConns.
       */
      webrtcPeerId?: string;
    }
  | {
      status: 'approved' | 'rejected';
      user: {
        id: string;
        name: string;
        color: string;
      };
      isOwner: boolean;
      /**
       * Platform type for this peer (browser, MCP server, etc.)
       * Used to distinguish between different types of participants.
       */
      platform?: OriginPlatform;
      /**
       * WebRTC peerId (UUID) for P2P transfers.
       * This is different from the awareness clientID (number).
       * The webrtcPeerId is used as the key in room.webrtcConns.
       */
      webrtcPeerId?: string;
    };

export interface SyncState {
  /** Connected to hub WebSocket or WebRTC peers */
  connected: boolean;
  /** Connected specifically to hub WebSocket (for detecting P2P-only mode) */
  hubConnected: boolean;
  /** Hub WebSocket has completed initial sync */
  synced: boolean;
  /** Number of peers connected via WebRTC P2P */
  peerCount: number;
  /** Whether IndexedDB has synced (local data available) */
  idbSynced: boolean;
  /** User's approval status for this plan (undefined if approval not required) */
  approvalStatus?: ApprovalStatus;
  /** Registry server port (for local artifact URLs) */
  registryPort: number | null;
  /** Error message if connection failed or timed out */
  error?: string;
  /** Whether connection timeout has been reached */
  timedOut: boolean;
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
  // Enable WebRTC for all documents including plan-index (needed for remote sync)
  const enableWebRTC = options.enableWebRTC ?? true;
  const { identity: githubIdentity } = useGitHubAuth();
  // biome-ignore lint/correctness/useExhaustiveDependencies: docName triggers Y.Doc recreation intentionally
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    hubConnected: false,
    synced: false,
    peerCount: 0,
    idbSynced: false,
    registryPort: null,
    timedOut: false,
  });
  const idbSyncedRef = useRef(false);
  const approvalStatusRef = useRef<ApprovalStatus | undefined>(undefined);
  const registryPortRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const errorRef = useRef<string | undefined>(undefined);
  const [rtcProvider, setRtcProvider] = useState<WebrtcProvider | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);

  const peerCountRef = useRef<number>(0);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally excluding githubIdentity to prevent provider recreation race
  useEffect(() => {
    let mounted = true;
    let ws: WebsocketProvider | null = null;

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

    // Connect to single Registry Hub with port discovery
    (async () => {
      const hubUrl = import.meta.env.VITE_HUB_URL
        ? (import.meta.env.VITE_HUB_URL as string)
        : await discoverHubUrl();

      if (!mounted) return;

      // Extract port from hub URL for local artifact URLs
      try {
        const url = new URL(hubUrl);
        const port = Number.parseInt(url.port || '32191', 10);
        registryPortRef.current = port;
      } catch {
        registryPortRef.current = null;
      }

      ws = new WebsocketProvider(hubUrl, docName, ydoc, {
        connect: true,
        maxBackoffTime: 2500,
      });

      wsProviderRef.current = ws;
      setWsProvider(ws);

      ws.on('status', () => {
        if (mounted) {
          // Clear timeout when connection succeeds
          const wsConnected = ws?.wsconnected ?? false;
          if (wsConnected && timedOutRef.current) {
            timedOutRef.current = false;
            errorRef.current = undefined;
          }
          updateSyncState();
        }
      });

      ws.on('sync', () => {
        if (mounted) updateSyncState();
      });
    })();

    // Connection timeout: If not connected within 10 seconds, show offline state
    const CONNECTION_TIMEOUT = 10000;
    const timeoutId = setTimeout(() => {
      if (!mounted) return;

      const wsConnected = wsProviderRef.current?.wsconnected ?? false;
      const hasP2PPeers = peerCountRef.current > 0;

      // Only timeout if we have no connection at all (no hub, no peers)
      if (!wsConnected && !hasP2PPeers) {
        timedOutRef.current = true;
        errorRef.current = 'Connection timeout - check network or start MCP server';
        updateSyncState();
      }
    }, CONNECTION_TIMEOUT);

    let rtc: WebrtcProvider | null = null;
    let handleBeforeUnload: (() => void) | null = null;

    if (enableWebRTC) {
      const signalingServer =
        (import.meta.env.VITE_WEBRTC_SIGNALING as string) || DEFAULT_SIGNALING_SERVER;

      rtc = new WebrtcProvider(`shipyard-${docName}`, ydoc, {
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

    // Track the last broadcast webrtcPeerId to avoid redundant updates
    let lastBroadcastPeerId: string | undefined;

    function setLocalAwarenessState() {
      if (!rtc || !githubIdentity) return;

      const ownerId = getPlanOwnerId(ydoc);
      const status = computeApprovalStatus(githubIdentity.username);

      // Only set awareness for plans with approval (not plan-index)
      if (status === undefined) return;

      // Get WebRTC peerId from the room (may be undefined if room not initialized yet)
      const webrtcPeerId = (rtc as unknown as { room?: { peerId?: string } }).room?.peerId;

      const baseAwarenessState = {
        user: {
          id: githubIdentity.username,
          name: githubIdentity.displayName,
          color: colorFromString(githubIdentity.username),
        },
        isOwner: ownerId === githubIdentity.username,
        webrtcPeerId,
      };

      const awarenessState: PlanAwarenessState =
        status === 'pending'
          ? {
              ...baseAwarenessState,
              status: 'pending',
              requestedAt: Date.now(),
            }
          : {
              ...baseAwarenessState,
              status,
            };

      rtc.awareness.setLocalStateField('planStatus', awarenessState);
      lastBroadcastPeerId = webrtcPeerId;
    }

    // Watch for room.peerId to become available and update awareness
    // This fixes P2P transfers failing with "Peer not found" because
    // webrtcPeerId was undefined when awareness was first set
    let roomPeerIdWatcher: ReturnType<typeof setInterval> | null = null;
    let signalingOpenWatcher: ReturnType<typeof setInterval> | null = null;

    function startWatchingForRoomPeerId() {
      if (!rtc) return;

      // Check immediately
      const room = (rtc as unknown as { room?: { peerId?: string } }).room;
      if (room?.peerId && room.peerId !== lastBroadcastPeerId) {
        setLocalAwarenessState();
        return; // peerId is already available
      }

      // Poll until room.peerId is available (y-webrtc doesn't emit an event for this)
      roomPeerIdWatcher = setInterval(() => {
        const room = (rtc as unknown as { room?: { peerId?: string } }).room;
        if (room?.peerId && room.peerId !== lastBroadcastPeerId) {
          setLocalAwarenessState();
          // Stop watching once we've broadcast the real peerId
          if (roomPeerIdWatcher) {
            clearInterval(roomPeerIdWatcher);
            roomPeerIdWatcher = null;
          }
        }
      }, 100); // Check every 100ms until room is ready
    }

    /**
     * Check if any signaling connection is currently open.
     */
    function isSignalingConnOpen(signalingConns: Array<{ ws: WebSocket }> | undefined): boolean {
      if (!signalingConns || signalingConns.length === 0) return false;

      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          return true;
        }
      }
      return false;
    }

    /**
     * Send identity and approval state if a signaling connection is ready.
     * Returns true if successful, false otherwise.
     */
    function sendIdentityWhenReady(signalingConns: Array<{ ws: WebSocket }> | undefined): boolean {
      if (!signalingConns) return false;

      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          sendUserIdentityToSignaling();
          pushApprovalStateToSignaling();
          return true;
        }
      }
      return false;
    }

    /**
     * Clear the signaling open watcher interval.
     */
    function clearSignalingWatcher() {
      if (signalingOpenWatcher) {
        clearInterval(signalingOpenWatcher);
        signalingOpenWatcher = null;
      }
    }

    /**
     * Poll for signaling connection and send identity when ready.
     */
    function pollForSignalingConnection(
      signalingConns: Array<{ ws: WebSocket }>,
      attemptsRef: { current: number },
      maxAttempts: number
    ) {
      attemptsRef.current++;

      if (attemptsRef.current > maxAttempts) {
        clearSignalingWatcher();
        return;
      }

      if (sendIdentityWhenReady(signalingConns)) {
        clearSignalingWatcher();
      }
    }

    // Watch for signaling WebSocket to open, then send identity
    // Fixes "unauthenticated" error when WebSocket wasn't ready during initial send
    function startWatchingForSignalingOpen() {
      if (!rtc || !githubIdentity) return;

      const signalingConns = (rtc as unknown as { signalingConns: Array<{ ws: WebSocket }> })
        .signalingConns;

      if (!signalingConns || signalingConns.length === 0) return;

      // Check immediately if any connection is already open
      if (isSignalingConnOpen(signalingConns)) {
        return; // Already connected, sendUserIdentityToSignaling already ran
      }

      // Poll until at least one signaling WebSocket is open
      const attemptsRef = { current: 0 };
      const maxAttempts = 100; // 10 seconds max
      signalingOpenWatcher = setInterval(() => {
        pollForSignalingConnection(signalingConns, attemptsRef, maxAttempts);
      }, 100);
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
    const metadataMap = ydoc.getMap<PlanMetadata>(YDOC_KEYS.METADATA);

    function handleMetadataChange() {
      updateApprovalStatus();
      pushApprovalStateToSignaling();
    }

    metadataMap.observe(handleMetadataChange);

    // Set initial awareness state when GitHub identity is available
    if (githubIdentity && rtc) {
      updateApprovalStatus();
      // Send user identity and approval state immediately (or when WebSocket opens)
      // No delay - we need this before any WebRTC messages are relayed
      sendUserIdentityToSignaling();
      pushApprovalStateToSignaling();
      // Watch for room.peerId to become available (fixes P2P transfer "Peer not found")
      startWatchingForRoomPeerId();
      // Retry sending identity until WebSocket is open (fixes "unauthenticated" error)
      startWatchingForSignalingOpen();
    }

    function updateSyncState() {
      const wsConnected = wsProviderRef.current?.wsconnected ?? false;
      const wsSynced = wsProviderRef.current?.synced ?? false;
      const anyConnected = wsConnected || (rtc?.connected ?? false);

      setSyncState({
        connected: anyConnected,
        hubConnected: wsConnected,
        synced: wsSynced,
        peerCount: peerCountRef.current,
        idbSynced: idbSyncedRef.current,
        approvalStatus: approvalStatusRef.current,
        registryPort: registryPortRef.current,
        timedOut: timedOutRef.current,
        error: errorRef.current,
      });
    }

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      if (ws) {
        ws.disconnect();
        ws.destroy();
      }
      wsProviderRef.current = null;
      setWsProvider(null);
      metadataMap.unobserve(handleMetadataChange);
      idbProvider.destroy();
      if (roomPeerIdWatcher) {
        clearInterval(roomPeerIdWatcher);
        roomPeerIdWatcher = null;
      }
      if (signalingOpenWatcher) {
        clearInterval(signalingOpenWatcher);
        signalingOpenWatcher = null;
      }
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
  }, [docName, ydoc, enableWebRTC]);

  // Separate effect for GitHub identity changes - updates awareness without destroying providers
  // This prevents y-webrtc "room already exists" race condition
  useEffect(() => {
    if (!rtcProvider || !githubIdentity) return;

    // These functions are defined in the main effect above
    // We need to expose them or recreate the logic here
    // For now, the main effect will handle initial setup
    // This effect handles changes after initial mount

    // TODO: Refactor to extract these functions outside the main effect
  }, [githubIdentity, rtcProvider]);

  return { ydoc, syncState, wsProvider, rtcProvider };
}
