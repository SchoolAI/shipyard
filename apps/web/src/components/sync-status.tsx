import { Chip } from '@heroui/react';

type SyncState = 'synced' | 'syncing' | 'offline';

interface SyncStatusProps {
  syncState: SyncState;
  serverConnected?: boolean;
  peerCount?: number;
}

export function SyncStatus({ syncState, serverConnected = false, peerCount = 0 }: SyncStatusProps) {
  const getConnectionDetails = () => {
    const parts: string[] = [];
    if (serverConnected) parts.push('server');
    if (peerCount > 0) parts.push(`${peerCount} P2P`);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  };

  const hasAnyConnection = serverConnected || peerCount > 0;

  if (!hasAnyConnection || syncState === 'offline') {
    return (
      <Chip color="warning" variant="soft">
        Offline - viewing snapshot
      </Chip>
    );
  }

  if (syncState === 'syncing') {
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
