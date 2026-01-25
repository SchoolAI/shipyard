/**
 * Hook to manage P2P grace period timing for plan loading.
 * Handles timeouts for when we're waiting for P2P peers to deliver plan data.
 */

import type { PlanMetadata } from '@shipyard/schema';
import { useEffect, useState } from 'react';

/** Sync state from useMultiProviderSync */
interface SyncState {
  idbSynced: boolean;
  hubConnected: boolean;
  peerCount: number;
}

/** Return type for the useP2PGracePeriod hook */
export interface UseP2PGracePeriodReturn {
  /** Whether the P2P grace period has expired without receiving data */
  p2pGracePeriodExpired: boolean;
  /** Whether peers are connected but sync has timed out */
  peerSyncTimedOut: boolean;
}

/**
 * Hook for managing P2P grace period when loading plans.
 *
 * When opening a shared URL, IndexedDB syncs immediately (empty) but we need
 * to wait for WebRTC to deliver the plan data before showing "Not Found".
 *
 * @param syncState - Current sync state from useMultiProviderSync
 * @param metadata - Current plan metadata (null if not loaded)
 */
export function useP2PGracePeriod(
  syncState: SyncState,
  metadata: PlanMetadata | null
): UseP2PGracePeriodReturn {
  const [p2pGracePeriodExpired, setP2pGracePeriodExpired] = useState(false);
  const [peerSyncTimedOut, setPeerSyncTimedOut] = useState(false);

  /** Start timeout when in P2P-only mode without metadata */
  useEffect(() => {
    const inP2POnlyMode = syncState.idbSynced && !syncState.hubConnected;
    const needsP2PData = !metadata && inP2POnlyMode;

    if (needsP2PData) {
      const gracePeriod = syncState.peerCount > 0 ? 30000 : 15000;
      const timeout = setTimeout(() => setP2pGracePeriodExpired(true), gracePeriod);
      return () => clearTimeout(timeout);
    }
    if (metadata) {
      setP2pGracePeriodExpired(false);
    }
    return undefined;
  }, [metadata, syncState.idbSynced, syncState.hubConnected, syncState.peerCount]);

  /** Timeout when peers are connected but no data arrives after 30 seconds */
  useEffect(() => {
    const hasPeersButNoData = syncState.peerCount > 0 && !metadata;

    if (hasPeersButNoData) {
      const timeout = setTimeout(() => setPeerSyncTimedOut(true), 30000);
      return () => clearTimeout(timeout);
    }

    /** Reset timeout state when metadata arrives or peers disconnect */
    setPeerSyncTimedOut(false);
    return undefined;
  }, [syncState.peerCount, metadata]);

  return {
    p2pGracePeriodExpired,
    peerSyncTimedOut,
  };
}
