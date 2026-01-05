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
      <div className="text-sm text-warning-dark bg-warning-light px-3 py-1 rounded inline-block">
        Offline - viewing snapshot
      </div>
    );
  }

  if (!synced) {
    return (
      <div className="text-sm text-info-dark bg-info-light px-3 py-1 rounded inline-block">
        Syncing...{getConnectionDetails()}
      </div>
    );
  }

  return (
    <div className="text-sm text-success-dark bg-success-light px-3 py-1 rounded inline-block">
      Synced{getConnectionDetails()}
    </div>
  );
}
