import { useEffect, useMemo, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

const WS_PORT = import.meta.env.VITE_WS_PORT || '1234';
const WS_URL = `ws://localhost:${WS_PORT}`;

export interface SyncState {
  connected: boolean;
  synced: boolean;
}

export function useYjsSync(planId: string): {
  ydoc: Y.Doc;
  syncState: SyncState;
} {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const [syncState, setSyncState] = useState<SyncState>({
    connected: false,
    synced: false,
  });

  useEffect(() => {
    // WebSocket provider for server sync
    const wsProvider = new WebsocketProvider(WS_URL, planId, ydoc);

    // IndexedDB for local persistence
    const idbProvider = new IndexeddbPersistence(planId, ydoc);

    wsProvider.on('status', ({ status }: { status: string }) => {
      setSyncState((s) => ({ ...s, connected: status === 'connected' }));
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      setSyncState((s) => ({ ...s, synced: isSynced }));
    });

    return () => {
      wsProvider.destroy();
      idbProvider.destroy();
    };
  }, [planId, ydoc]);

  return { ydoc, syncState };
}
