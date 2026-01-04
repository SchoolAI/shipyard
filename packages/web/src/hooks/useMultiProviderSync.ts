import { useEffect, useMemo, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

// Registry server ports to try
const DEFAULT_REGISTRY_PORTS = [32191, 32192];

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
 * Hook for connecting to multiple Yjs providers discovered via registry
 */
export function useMultiProviderSync(docName: string): {
  ydoc: Y.Doc;
  syncState: SyncState;
} {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    synced: false,
    serverCount: 0,
  });

  useEffect(() => {
    let mounted = true;
    const wsProviders: WebsocketProvider[] = [];

    // IndexedDB for local persistence
    const idbProvider = new IndexeddbPersistence(docName, ydoc);

    // Discover and connect to all servers
    discoverServers()
      .then((servers) => {
        if (!mounted) return;

        // Create provider for each server
        for (const server of servers) {
          const provider = new WebsocketProvider(server.url, docName, ydoc, {
            connect: true,
          });

          // Track connection status
          provider.on('status', () => {
            updateSyncState();
          });

          provider.on('sync', () => {
            updateSyncState();
          });

          wsProviders.push(provider);
        }

        updateSyncState();
      })
      .catch(() => {
        // Silently fail - registry not available (expected in some modes)
      });

    function updateSyncState() {
      const anyConnected = wsProviders.some((p) => p.wsconnected);
      const allSynced = wsProviders.every((p) => p.synced);

      setSyncState({
        connected: anyConnected,
        synced: allSynced,
        serverCount: wsProviders.length,
      });
    }

    return () => {
      mounted = false;
      for (const provider of wsProviders) {
        provider.destroy();
      }
      idbProvider.destroy();
    };
  }, [docName, ydoc]);

  return { ydoc, syncState };
}
