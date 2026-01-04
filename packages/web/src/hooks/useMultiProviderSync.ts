import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

// Registry server ports to try
const DEFAULT_REGISTRY_PORTS = [32191, 32192];

// After this many failed reconnects (using y-websocket's internal counter), destroy the provider
// At 5 fails with 2500ms max backoff, this is roughly 5-7 seconds of trying
const MAX_FAILED_RECONNECTS = 5;

// How often to refresh from registry (ms)
const REGISTRY_REFRESH_INTERVAL = 10000;

// How often to check for dead providers (ms)
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
      // Try next port
    }
  }

  // No registry found
  return [];
}

/**
 * Hook for connecting to multiple Yjs providers discovered via registry.
 * Handles disconnection gracefully by removing dead providers after max retries.
 * Uses y-websocket's built-in exponential backoff.
 */
export function useMultiProviderSync(docName: string): {
  ydoc: Y.Doc;
  syncState: SyncState;
} {
  // Create new Y.Doc when docName changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: docName triggers Y.Doc recreation intentionally
  const ydoc = useMemo(() => new Y.Doc(), [docName]);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    synced: false,
    serverCount: 0,
    activeCount: 0,
  });

  // Use ref to track providers so we can modify without re-running effect
  const providersRef = useRef<Map<string, ProviderState>>(new Map());

  // Track recently removed servers to prevent re-adding from stale registry
  // Use sessionStorage to persist across page refreshes
  const removedServersRef = useRef<Map<string, number>>(null as unknown as Map<string, number>);
  if (removedServersRef.current === null) {
    try {
      const stored = sessionStorage.getItem('peer-plan-removed-servers');
      if (stored) {
        const entries = JSON.parse(stored) as [string, number][];
        // Filter out expired entries
        const now = Date.now();
        const valid = entries.filter(([, time]) => now - time < REMOVED_SERVER_TTL);
        removedServersRef.current = new Map(valid);
      } else {
        removedServersRef.current = new Map();
      }
    } catch {
      removedServersRef.current = new Map();
    }
  }

  useEffect(() => {
    let mounted = true;
    let refreshInterval: ReturnType<typeof setInterval> | null = null;
    let deadCheckInterval: ReturnType<typeof setInterval> | null = null;

    // IndexedDB for local persistence
    const idbProvider = new IndexeddbPersistence(docName, ydoc);

    function updateSyncState() {
      const providers = Array.from(providersRef.current.values());
      const connectedProviders = providers.filter((p) => p.provider.wsconnected);
      const anyConnected = connectedProviders.length > 0;
      const anySynced = providers.some((p) => p.provider.synced);

      setSyncState({
        connected: anyConnected,
        synced: anySynced,
        serverCount: providers.length,
        activeCount: connectedProviders.length,
      });
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
      removedServersRef.current.set(url, Date.now());
      // Persist to sessionStorage so it survives page refresh
      try {
        const entries = Array.from(removedServersRef.current.entries());
        sessionStorage.setItem('peer-plan-removed-servers', JSON.stringify(entries));
      } catch {
        // Ignore storage errors
      }
    }

    function isRecentlyRemoved(url: string): boolean {
      const removedAt = removedServersRef.current.get(url);
      if (!removedAt) return false;
      if (Date.now() - removedAt > REMOVED_SERVER_TTL) {
        // Expired, clean up
        removedServersRef.current.delete(url);
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

      // Track connection status changes
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

    // Initial server discovery
    refreshServers();

    // Periodic refresh to detect new servers
    refreshInterval = setInterval(refreshServers, REGISTRY_REFRESH_INTERVAL);

    // Periodic check for dead providers (uses y-websocket's internal backoff counter)
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
    };
  }, [docName, ydoc]);

  return { ydoc, syncState };
}
