import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const DEFAULT_SIGNALING_SERVER = 'wss://shipyard-signaling.jacob-191.workers.dev';

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

  const [rtcProvider, setRtcProvider] = useState<WebrtcProvider | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    // Skip all sync setup if docName is empty (e.g., for snapshots)
    if (!docName) {
      return;
    }

    let mounted = true;
    let ws: WebsocketProvider | null = null;
    let rtc: WebrtcProvider | null = null;
    let handleBeforeUnload: (() => void) | null = null;

    // IndexedDB persistence
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

    // WebRTC P2P sync - simple setup without authentication
    if (enableWebRTC) {
      const signalingServer =
        (import.meta.env.VITE_WEBRTC_SIGNALING as string) || DEFAULT_SIGNALING_SERVER;

      const roomName = `shipyard-${docName}`;

      // Use cached provider to avoid duplicate room errors in StrictMode
      rtc = getOrCreateWebrtcProvider(roomName, ydoc, signalingServer);
      setRtcProvider(rtc);

      // Expose provider on window for debugging (only for plan-index)
      if (docName === 'plan-index') {
        (window as unknown as { planIndexRtcProvider: WebrtcProvider }).planIndexRtcProvider = rtc;
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
      mounted = false;
      clearTimeout(timeoutId);

      // Cleanup WebSocket provider
      if (ws) {
        ws.disconnect();
        ws.destroy();
      }
      wsProviderRef.current = null;
      setWsProvider(null);

      // Cleanup IndexedDB provider
      idbProvider.destroy();

      // Cleanup WebRTC provider using cached release
      if (rtc && enableWebRTC) {
        const roomName = `shipyard-${docName}`;
        releaseWebrtcProvider(roomName);
        setRtcProvider(null);
      }

      // Remove beforeunload listener
      if (handleBeforeUnload) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      }
    };
  }, [docName, ydoc, enableWebRTC, userName]);

  return { ydoc, syncState, wsProvider, rtcProvider };
}
