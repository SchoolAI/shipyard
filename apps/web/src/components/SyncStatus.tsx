import { hasAnyConnection } from '@/utils/connectionStatus';

interface SyncStatusProps {
  synced: boolean;
  /** Number of MCP servers connected */
  serverCount?: number;
  /** Number of P2P peers connected */
  peerCount?: number;
}

export function SyncStatus({ synced, serverCount = 0, peerCount = 0 }: SyncStatusProps) {
  const getConnectionDetails = () => {
    const parts: string[] = [];
    if (serverCount > 0) parts.push(`${serverCount} MCP`);
    if (peerCount > 0) parts.push(`${peerCount} P2P`);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  };

  if (!hasAnyConnection(serverCount, peerCount)) {
    return (
      <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded inline-block">
        Offline - viewing snapshot
      </div>
    );
  }

  if (!synced) {
    return (
      <div className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded inline-block">
        Syncing...{getConnectionDetails()}
      </div>
    );
  }

  return (
    <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded inline-block">
      Synced{getConnectionDetails()}
    </div>
  );
}
