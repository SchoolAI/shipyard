import {
  getPlanOwnerId,
  isApprovalRequired,
  isUserApproved,
  isUserRejected,
  YDOC_KEYS,
} from '@shipyard/schema';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface YDocApprovalStatusResult {
  /** User's approval status, undefined if approval not required for this plan */
  status: ApprovalStatus | undefined;
  /** Whether the user needs to wait for approval */
  isPending: boolean;
  /** Whether the user has been approved */
  isApproved: boolean;
  /** Whether the user has been rejected */
  isRejected: boolean;
  /** Whether approval is required for this plan */
  requiresApproval: boolean;
  /** The plan owner's ID */
  ownerId: string | null;
}

/**
 * Hook for reading user's approval status directly from Y.Doc CRDT.
 *
 * This hook observes the Y.Doc metadata map and re-renders when approval
 * status changes (approvedUsers, rejectedUsers, ownerId).
 *
 * Benefits over using syncState.approvalStatus:
 * - Single source of truth (Y.Doc CRDT)
 * - No signaling server dependency
 * - Automatically syncs via WebRTC P2P
 * - Works offline with IndexedDB persistence
 *
 * @param ydoc - The Y.Doc containing plan metadata
 * @param userId - The current user's ID (GitHub username), or null if not authenticated
 */
export function useYDocApprovalStatus(
  ydoc: Y.Doc,
  userId: string | null
): YDocApprovalStatusResult {
  // Cache the last snapshot to prevent infinite re-renders from useSyncExternalStore.
  // useSyncExternalStore uses Object.is() to compare snapshots, so returning a new
  // object every time (even with identical values) causes infinite update loops.
  const cachedSnapshot = useRef<YDocApprovalStatusResult | null>(null);

  // Subscribe to Y.Doc metadata changes
  const subscribe = useCallback(
    (callback: () => void) => {
      const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
      metadataMap.observe(callback);
      return () => metadataMap.unobserve(callback);
    },
    [ydoc]
  );

  // Get current approval status snapshot from Y.Doc
  // IMPORTANT: Must return the same object reference if values haven't changed
  // to avoid infinite update loops in useSyncExternalStore
  const getSnapshot = useCallback((): YDocApprovalStatusResult => {
    const ownerId = getPlanOwnerId(ydoc);
    const requiresApproval = isApprovalRequired(ydoc);

    let newSnapshot: YDocApprovalStatusResult;

    // If approval is not required (no ownerId), everyone has access
    if (!requiresApproval) {
      newSnapshot = {
        status: undefined,
        isPending: false,
        isApproved: true,
        isRejected: false,
        requiresApproval: false,
        ownerId,
      };
    } else if (!userId) {
      // User not authenticated - they are pending until they authenticate
      newSnapshot = {
        status: 'pending',
        isPending: true,
        isApproved: false,
        isRejected: false,
        requiresApproval: true,
        ownerId,
      };
    } else if (isUserRejected(ydoc, userId)) {
      // Check rejection first (rejected takes precedence)
      newSnapshot = {
        status: 'rejected',
        isPending: false,
        isApproved: false,
        isRejected: true,
        requiresApproval: true,
        ownerId,
      };
    } else if (isUserApproved(ydoc, userId)) {
      // Check if user is approved (owner is always approved)
      newSnapshot = {
        status: 'approved',
        isPending: false,
        isApproved: true,
        isRejected: false,
        requiresApproval: true,
        ownerId,
      };
    } else {
      // User is pending approval
      newSnapshot = {
        status: 'pending',
        isPending: true,
        isApproved: false,
        isRejected: false,
        requiresApproval: true,
        ownerId,
      };
    }

    // Return cached snapshot if values haven't changed (prevents infinite loops)
    const cached = cachedSnapshot.current;
    if (
      cached &&
      cached.status === newSnapshot.status &&
      cached.isPending === newSnapshot.isPending &&
      cached.isApproved === newSnapshot.isApproved &&
      cached.isRejected === newSnapshot.isRejected &&
      cached.requiresApproval === newSnapshot.requiresApproval &&
      cached.ownerId === newSnapshot.ownerId
    ) {
      return cached;
    }

    // Cache and return the new snapshot
    cachedSnapshot.current = newSnapshot;
    return newSnapshot;
  }, [ydoc, userId]);

  // Use useSyncExternalStore for safe concurrent rendering
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
