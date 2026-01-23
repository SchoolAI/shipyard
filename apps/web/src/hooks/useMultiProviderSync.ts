import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const DEFAULT_SIGNALING_SERVER = 'ws://localhost:4444';

/**
 * Module-level cache for WebRTC providers to prevent duplicate room errors.
 *
 * y-webrtc maintains an internal room registry that throws if a room with the same name
 * already exists. The issue is that y-webrtc's destroy() method is asynchronous -
 * it waits for `this.key.then()` before removing the room from the registry.
 *
 * When React StrictMode re-runs effects, the cleanup from the first run and the
 * setup from the second run can race. The new provider tries to create a room
 * before the old one has finished cleaning up.
 *
 * This cache tracks active providers per room. If a provider already exists for a room,
 * we reuse it and track reference counts. This prevents the duplicate room error
 * while ensuring proper cleanup when all consumers unmount.
 */
interface CachedProvider {
  provider: WebrtcProvider;
  refCount: number;
  ydoc: Y.Doc;
}

const webrtcProviderCache = new Map<string, CachedProvider>();

/**
 * Get or create a WebRTC provider for a room.
 * Uses reference counting to manage lifecycle across multiple consumers.
 */
function getOrCreateWebrtcProvider(
  roomName: string,
  ydoc: Y.Doc,
  signalingServer: string
): WebrtcProvider {
  const existing = webrtcProviderCache.get(roomName);

  if (existing) {
    // Reuse existing provider if it's for the same ydoc
    if (existing.ydoc === ydoc) {
      existing.refCount++;
      return existing.provider;
    }
    // Different ydoc - this shouldn't happen in normal usage, but handle gracefully
    // by destroying the old provider first
    releaseWebrtcProvider(roomName);
  }

  // Create new provider with ICE server configuration for better NAT traversal
  // STUN servers help establish direct peer connections
  // TURN servers relay traffic when direct connection fails (common on mobile)

  // Build ICE servers configuration
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Add TURN server if configured via environment variables
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: [signalingServer],
    peerOpts: {
      config: {
        iceServers,
      },
    },
  });

  webrtcProviderCache.set(roomName, {
    provider,
    refCount: 1,
    ydoc,
  });

  return provider;
}

/**
 * Release a reference to a WebRTC provider.
 * Destroys the provider when the last reference is released.
 */
function releaseWebrtcProvider(roomName: string): void {
  const cached = webrtcProviderCache.get(roomName);
  if (!cached) return;

  cached.refCount--;

  if (cached.refCount <= 0) {
    // Last reference - destroy the provider
    cached.provider.awareness?.setLocalState(null);
    cached.provider.disconnect();
    cached.provider.destroy();
    webrtcProviderCache.delete(roomName);
  }
}

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

/**
 * Basic awareness state for user presence.
 * Simplified from Milestone 8 - just presence info, no approval status.
 */
export interface UserPresence {
  user: {
    name: string;
    color: string;
  };
}

interface SyncStateBase {
  connected: boolean;
  hubConnected: boolean;
  synced: boolean;
  peerCount: number;
  idbSynced: boolean;
  /** Registry server port (for local artifact URLs) */
  registryPort: number | null;
}

export type SyncState =
  | (SyncStateBase & { timedOut: false })
  | (SyncStateBase & { timedOut: true; error: string });

export function isSyncStateTimedOut(
  state: SyncState
): state is SyncStateBase & { timedOut: true; error: string } {
  return state.timedOut;
}

/**
 * Hook for connecting to a single Registry Hub for Yjs sync.
 * Also manages IndexedDB persistence and WebRTC P2P sync.
 *
 * Milestone 6 baseline: Simple three-provider setup without authentication
 * or approval state management at the signaling layer.
 *
 * @param docName - Document name (plan ID or 'plan-index')
 * @param options - Optional configuration
 * @param options.enableWebRTC - Enable P2P WebRTC sync (default: true)
 * @param options.userName - Optional user name for presence awareness
 */
export function useMultiProviderSync(
  docName: string,
  options: { enableWebRTC?: boolean; userName?: string } = {}
): {
  ydoc: Y.Doc;
  syncState: SyncState;
  /** WebSocket provider to hub (null if not connected) */
  wsProvider: WebsocketProvider | null;
  /** WebRTC provider for P2P sync (null if not connected) */
  rtcProvider: WebrtcProvider | null;
  /** Manually trigger reconnection after circuit breaker trips */
  reconnect: () => void;
  /** True while reconnection is in progress (prevents button spam) */
  isReconnecting: boolean;
} {
  // Enable WebRTC for all documents including plan-index (needed for remote sync)
  const enableWebRTC = options.enableWebRTC ?? true;
  const userName = options.userName ?? 'Anonymous';

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
  } satisfies SyncState);
  const idbSyncedRef = useRef(false);
  const registryPortRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const errorRef = useRef<string | undefined>(undefined);
  const peerCountRef = useRef<number>(0);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const rtcProviderRef = useRef<WebrtcProvider | null>(null);

  const [rtcProvider, setRtcProvider] = useState<WebrtcProvider | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);

  // Manual reconnect trigger - incrementing this re-runs the effect
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // Track whether reconnection is in progress (prevents button spam)
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Reconnect function exposed to consumers
  const reconnect = useCallback(() => {
    // Prevent rapid repeated clicks - button spam can cause orphaned WebSocket providers
    if (isReconnecting) return;

    // Reset timeout/error state
    timedOutRef.current = false;
    errorRef.current = undefined;
    idbSyncedRef.current = false;

    // Mark reconnecting and disable button for 2 seconds
    // This gives hub discovery (1s timeout per port) time to complete
    setIsReconnecting(true);
    setTimeout(() => {
      setIsReconnecting(false);
    }, 2000);

    // Trigger effect re-run
    setReconnectTrigger((prev) => prev + 1);
  }, [isReconnecting]);

  // Helper: Handle connection timeout with circuit breaker
  const handleConnectionTimeout = useCallback(
    (mounted: { current: boolean }, updateSyncState: () => void) => {
      if (!mounted.current) return;

      const wsConnected = wsProviderRef.current?.wsconnected ?? false;
      const hasP2PPeers = peerCountRef.current > 0;

      // Only timeout if we have no connection at all (no hub, no peers)
      if (!wsConnected && !hasP2PPeers) {
        timedOutRef.current = true;
        errorRef.current = 'Connection timeout - check network or start MCP server';

        // CIRCUIT BREAKER: Stop providers to prevent infinite reconnection loop
        // Without this, y-websocket and y-webrtc retry forever with exponential backoff
        if (wsProviderRef.current) {
          wsProviderRef.current.disconnect();
        }
        if (rtcProviderRef.current) {
          rtcProviderRef.current.disconnect();
        }

        updateSyncState();
      }
    },
    []
  );

  // Helper: Cleanup WebSocket provider and listeners
  const cleanupWebSocketProvider = useCallback(
    (
      ws: WebsocketProvider | null,
      wsStatusListener: (() => void) | null,
      wsSyncListener: (() => void) | null
    ) => {
      if (!ws) return;

      if (wsStatusListener) ws.off('status', wsStatusListener);
      if (wsSyncListener) ws.off('sync', wsSyncListener);
      ws.disconnect();
      ws.destroy();
    },
    []
  );

  // Helper: Cleanup WebRTC provider and listeners
  const cleanupWebRTCProvider = useCallback(
    (
      rtc: WebrtcProvider | null,
      awarenessChangeListener: (() => void) | null,
      rtcSyncedListener: (() => void) | null,
      roomName: string
    ) => {
      if (!rtc) return;

      const awareness = rtc.awareness;
      if (awareness && awarenessChangeListener) {
        awareness.off('change', awarenessChangeListener);
      }
      if (rtcSyncedListener) rtc.off('synced', rtcSyncedListener);

      releaseWebrtcProvider(roomName);
    },
    []
  );

  // reconnectTrigger is intentionally included to re-run the effect when reconnect() is called.
  // This is the mechanism for manual reconnection after circuit breaker trips.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnectTrigger is intentionally unused but triggers effect re-run
  useEffect(() => {
    // Skip all sync setup if docName is empty (e.g., for snapshots)
    if (!docName) {
      return;
    }

    // Use ref object for mounted state so timeout callback always sees current value
    const mountedRef = { current: true };
    let ws: WebsocketProvider | null = null;
    let rtc: WebrtcProvider | null = null;
    let handleBeforeUnload: (() => void) | null = null;

    // Store listener references for proper cleanup (prevents memory leak)
    let wsStatusListener: (() => void) | null = null;
    let wsSyncListener: (() => void) | null = null;
    let awarenessChangeListener: (() => void) | null = null;
    let rtcSyncedListener: (() => void) | null = null;

    // IndexedDB persistence
    const idbProvider = new IndexeddbPersistence(docName, ydoc);

    // Track when IndexedDB has synced - this means local data is available
    idbProvider.whenSynced.then(() => {
      if (mountedRef.current) {
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

      // Critical: Check mounted AFTER async hub discovery completes
      // Component could have unmounted during the await
      if (!mountedRef.current) return;

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

      // Store listener references for cleanup
      wsStatusListener = () => {
        if (mountedRef.current) {
          // Clear timeout when connection succeeds
          const wsConnected = ws?.wsconnected ?? false;
          if (wsConnected && timedOutRef.current) {
            timedOutRef.current = false;
            errorRef.current = undefined;
          }
          updateSyncState();
        }
      };
      ws.on('status', wsStatusListener);

      wsSyncListener = () => {
        if (mountedRef.current) updateSyncState();
      };
      ws.on('sync', wsSyncListener);
    })();

    // Connection timeout: If not connected within 10 seconds, show offline state
    // CIRCUIT BREAKER: Also disconnect providers to stop infinite reconnection loop
    const CONNECTION_TIMEOUT = 10000;
    const timeoutId = setTimeout(
      () => handleConnectionTimeout(mountedRef, updateSyncState),
      CONNECTION_TIMEOUT
    );

    // WebRTC P2P sync - simple setup without authentication
    if (enableWebRTC) {
      const signalingServer =
        (import.meta.env.VITE_WEBRTC_SIGNALING as string) || DEFAULT_SIGNALING_SERVER;

      const roomName = `shipyard-${docName}`;

      // Use cached provider to avoid duplicate room errors in StrictMode
      rtc = getOrCreateWebrtcProvider(roomName, ydoc, signalingServer);
      rtcProviderRef.current = rtc;
      setRtcProvider(rtc);

      // Expose provider on window for debugging
      if (docName === 'plan-index') {
        (window as unknown as { planIndexRtcProvider: WebrtcProvider }).planIndexRtcProvider = rtc;
      } else {
        // Also expose plan-specific provider for debugging
        (window as unknown as { planRtcProvider: WebrtcProvider }).planRtcProvider = rtc;
      }

      // Set awareness for user presence with planStatus field
      // This matches what useP2PPeers expects and what MCP servers broadcast
      const awareness = rtc.awareness;
      awareness.setLocalStateField('planStatus', {
        user: {
          id: userName,
          name: userName,
          color: colorFromString(userName),
        },
        platform: 'browser',
        isOwner: false, // Updated by useBroadcastApprovalStatus if user is owner
        status: 'approved' as const, // Browsers are auto-approved
      });

      // Count peers from awareness states (excluding self)
      // Store as listener reference for cleanup
      awarenessChangeListener = () => {
        const states = awareness.getStates();
        // Count peers excluding ourselves
        const peerCount = states.size - 1;
        peerCountRef.current = Math.max(0, peerCount);
        if (mountedRef.current) {
          updateSyncState();
        }
      };

      // Listen for awareness changes (peers joining/leaving)
      awareness.on('change', awarenessChangeListener);

      // Initial count
      awarenessChangeListener();

      // Track sync state - store listener reference for cleanup
      rtcSyncedListener = () => {
        if (mountedRef.current) {
          updateSyncState();
        }
      };
      rtc.on('synced', rtcSyncedListener);

      // Clear awareness on page unload so other peers see us leave immediately
      // instead of waiting for the 30-second awareness timeout
      handleBeforeUnload = () => {
        awareness.setLocalState(null);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    function updateSyncState() {
      const wsConnected = wsProviderRef.current?.wsconnected ?? false;
      const wsSynced = wsProviderRef.current?.synced ?? false;
      const anyConnected = wsConnected || (rtc?.connected ?? false);

      const baseState: SyncStateBase = {
        connected: anyConnected,
        hubConnected: wsConnected,
        synced: wsSynced,
        peerCount: peerCountRef.current,
        idbSynced: idbSyncedRef.current,
        registryPort: registryPortRef.current,
      };

      if (timedOutRef.current && errorRef.current) {
        setSyncState({ ...baseState, timedOut: true, error: errorRef.current });
      } else {
        setSyncState({ ...baseState, timedOut: false });
      }
    }

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);

      // IMPORTANT: Remove event listeners BEFORE destroying providers
      // This prevents memory leaks from accumulated listeners in React StrictMode
      cleanupWebSocketProvider(ws, wsStatusListener, wsSyncListener);
      wsProviderRef.current = null;
      setWsProvider(null);

      // Cleanup IndexedDB provider
      try {
        idbProvider.destroy();
      } catch {
        // Ignore errors during cleanup
      }

      // Cleanup WebRTC provider - remove listeners first
      if (enableWebRTC) {
        const roomName = `shipyard-${docName}`;
        cleanupWebRTCProvider(rtc, awarenessChangeListener, rtcSyncedListener, roomName);
        setRtcProvider(null);
        rtcProviderRef.current = null;

        // Clean up window debug references
        if (docName === 'plan-index') {
          delete (window as unknown as { planIndexRtcProvider?: WebrtcProvider })
            .planIndexRtcProvider;
        } else {
          delete (window as unknown as { planRtcProvider?: WebrtcProvider }).planRtcProvider;
        }
      }

      // Remove beforeunload listener
      if (handleBeforeUnload) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [
    docName,
    ydoc,
    enableWebRTC,
    userName,
    reconnectTrigger,
    handleConnectionTimeout,
    cleanupWebSocketProvider,
    cleanupWebRTCProvider,
  ]);

  return { ydoc, syncState, wsProvider, rtcProvider, reconnect, isReconnecting };
}
