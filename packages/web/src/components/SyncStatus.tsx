interface SyncStatusProps {
  connected: boolean;
  synced: boolean;
}

export function SyncStatus({ connected, synced }: SyncStatusProps) {
  if (!connected) {
    return (
      <div className="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded inline-block">
        Offline - viewing snapshot
      </div>
    );
  }

  if (!synced) {
    return (
      <div className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded inline-block">
        Syncing...
      </div>
    );
  }

  return (
    <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded inline-block">
      Connected
    </div>
  );
}
