import { Chip } from '@heroui/react';
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
      <Chip color="warning" variant="soft">
        Offline - viewing snapshot
      </Chip>
    );
  }

  if (!synced) {
    return (
      <Chip color="accent" variant="soft">
        Syncing...{getConnectionDetails()}
      </Chip>
    );
  }

  return (
    <Chip color="success" variant="soft">
      Synced{getConnectionDetails()}
    </Chip>
  );
}
