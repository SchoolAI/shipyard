import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const DEFAULT_SIGNALING_SERVER = 'wss://signaling.yjs.dev';

const DEFAULT_REGISTRY_PORTS = [32191, 32192];

// After this many failed reconnects (using y-websocket's internal counter), destroy the provider
// At 5 fails with 2500ms max backoff, this is roughly 5-7 seconds of trying
const MAX_FAILED_RECONNECTS = 5;

const REGISTRY_REFRESH_INTERVAL = 10000;
const DEAD_PROVIDER_CHECK_INTERVAL = 2000;

// How long to remember removed servers (prevent re-adding from stale registry)
const REMOVED_SERVER_TTL = 60000; // 1 minute

interface ServerEntry {
  port: number;
  pid: number;
  url: string;
  registeredAt: number;
}

interface SyncState {
  connected: boolean;
  synced: boolean;
  serverCount: number;
  activeCount: number;
  /** Number of peers connected via WebRTC P2P */
  peerCount: number;
}

interface ProviderState {
  provider: WebsocketProvider;
  url: string;
}

/**
 * Discover active WebSocket servers from registry
 */
async function discoverServers(): Promise<ServerEntry[]> {
  const ports = import.meta.env.VITE_REGISTRY_PORT
    ? [Number.parseInt(import.meta.env.VITE_REGISTRY_PORT as string, 10)]
    : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        const data = (await res.json()) as { servers: ServerEntry[] };
        return data.servers;
      }
    } catch {
      // continue to next port
    }
  }

  return [];
}

/**
 * Hook for connecting to multiple Yjs providers discovered via registry.
 * Handles disconnection gracefully by removing dead providers after max retries.
 * Uses y-websocket's built-in exponential backoff.
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
  providers: WebsocketProvider[];
  /** WebRTC provider for P2P sync (null if not connected) */
  rtcProvider: WebrtcProvider | null;
} {
  // Don't enable WebRTC for plan-index (only for individual plans)
  const enableWebRTC = options.enableWebRTC ?? docName !== 'plan-index';
  // biome-ignore lint/correctness/useExhaustiveDependencies: docName triggers Y.Doc recreation intentionally
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    synced: false,
    serverCount: 0,
    activeCount: 0,
    peerCount: 0,
  });
  const [rtcProvider, setRtcProvider] = useState<WebrtcProvider | null>(null);

  const [providersList, setProvidersList] = useState<WebsocketProvider[]>([]);

  // Use ref to track providers so we can modify without re-running effect
  const providersRef = useRef<Map<string, ProviderState>>(new Map());

  const peerCountRef = useRef<number>(0);

  // Use sessionStorage to persist across page refreshes
  const removedServersRef = useRef<Map<string, number> | null>(null);

  // Lazy initialization - runs once per hook instance
  if (removedServersRef.current === null) {
    removedServersRef.current = loadRemovedServersFromSession();
  }

  function loadRemovedServersFromSession(): Map<string, number> {
    try {
      const stored = sessionStorage.getItem('peer-plan-removed-servers');
      if (stored) {
        const entries = JSON.parse(stored) as [string, number][];
        const now = Date.now();
        const valid = entries.filter(([, time]) => now - time < REMOVED_SERVER_TTL);
        return new Map(valid);
      }
    } catch {
      // Ignore parse errors
    }
    return new Map();
  }

  useEffect(() => {
    let mounted = true;
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    let deadCheckInterval: ReturnType<typeof setInterval> | null = null;

    const idbProvider = new IndexeddbPersistence(docName, ydoc);

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

    function updateSyncState() {
      const providers = Array.from(providersRef.current.values());
      const connectedProviders = providers.filter((p) => p.provider.wsconnected);
      const anyConnected = connectedProviders.length > 0 || (rtc?.connected ?? false);
      // Consider synced if ANY provider has synced
      // For WebRTC: consider synced if we have connected peers (P2P doesn't have central sync point)
      const anySynced = providers.some((p) => p.provider.synced) || peerCountRef.current > 0; // WebRTC with peers = synced

      setSyncState({
        connected: anyConnected,
        synced: anySynced,
        serverCount: providers.length,
        activeCount: connectedProviders.length,
        peerCount: peerCountRef.current,
      });

      setProvidersList(providers.map((p) => p.provider));
    }

    /**
     * Check for dead providers using y-websocket's internal reconnect counter.
     * This leverages the built-in exponential backoff.
     */
    function checkDeadProviders() {
      for (const [url, state] of providersRef.current.entries()) {
        // Access y-websocket's internal counter
        const failCount = (state.provider as unknown as { wsUnsuccessfulReconnects: number })
          .wsUnsuccessfulReconnects;

        if (failCount >= MAX_FAILED_RECONNECTS) {
          removeProvider(url, state);
        }
      }
      updateSyncState();
    }

    function removeProvider(url: string, state: ProviderState) {
      state.provider.disconnect();
      state.provider.destroy();
      providersRef.current.delete(url);

      // Remember this server was removed to prevent re-adding from stale registry
      const removedServers = removedServersRef.current;
      if (removedServers) {
        removedServers.set(url, Date.now());
        // Persist to sessionStorage so it survives page refresh
        try {
          const entries = Array.from(removedServers.entries());
          sessionStorage.setItem('peer-plan-removed-servers', JSON.stringify(entries));
        } catch {
          // Ignore storage errors
        }
      }
    }

    function isRecentlyRemoved(url: string): boolean {
      const removedServers = removedServersRef.current;
      if (!removedServers) return false;

      const removedAt = removedServers.get(url);
      if (!removedAt) return false;

      if (Date.now() - removedAt > REMOVED_SERVER_TTL) {
        removedServers.delete(url);
        return false;
      }
      return true;
    }

    function createProvider(server: ServerEntry): ProviderState {
      const provider = new WebsocketProvider(server.url, docName, ydoc, {
        connect: true,
        maxBackoffTime: 2500,
      });

      const state: ProviderState = {
        provider,
        url: server.url,
      };

      provider.on('status', () => {
        updateSyncState();
      });

      provider.on('sync', () => {
        updateSyncState();
      });

      return state;
    }

    function addNewServers(servers: ServerEntry[], currentUrls: Set<string>) {
      for (const server of servers) {
        if (currentUrls.has(server.url)) continue;
        // Don't re-add servers we recently removed (stale registry data)
        if (isRecentlyRemoved(server.url)) continue;

        const state = createProvider(server);
        providersRef.current.set(server.url, state);
      }
    }

    function removeStaleServers(currentUrls: Set<string>, newUrls: Set<string>) {
      for (const url of currentUrls) {
        if (newUrls.has(url)) continue;
        const state = providersRef.current.get(url);
        // Only remove if not connected (give connected ones benefit of doubt)
        if (state && !state.provider.wsconnected) {
          removeProvider(url, state);
        }
      }
    }

    async function refreshServers() {
      if (!mounted) return;

      try {
        const servers = await discoverServers();
        const currentUrls = new Set(providersRef.current.keys());
        const newUrls = new Set(servers.map((s) => s.url));

        addNewServers(servers, currentUrls);
        removeStaleServers(currentUrls, newUrls);
        updateSyncState();
      } catch {
        // Registry not available - keep existing connections
      }
    }

    refreshServers();
    refreshInterval = setInterval(refreshServers, REGISTRY_REFRESH_INTERVAL);
    deadCheckInterval = setInterval(checkDeadProviders, DEAD_PROVIDER_CHECK_INTERVAL);

    return () => {
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      if (deadCheckInterval) {
        clearInterval(deadCheckInterval);
      }
      for (const state of providersRef.current.values()) {
        state.provider.disconnect();
        state.provider.destroy();
      }
      providersRef.current.clear();
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
  }, [docName, ydoc, enableWebRTC]);

  return { ydoc, syncState, providers: providersList, rtcProvider };
}
