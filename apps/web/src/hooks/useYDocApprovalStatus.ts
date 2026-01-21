import {
  getPlanOwnerId,
  isApprovalRequired,
  isUserApproved,
  isUserRejected,
  YDOC_KEYS,
} from '@shipyard/schema';
import { useCallback, useSyncExternalStore } from 'react';
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
  const getSnapshot = useCallback((): YDocApprovalStatusResult => {
    const ownerId = getPlanOwnerId(ydoc);
    const requiresApproval = isApprovalRequired(ydoc);

    // If approval is not required (no ownerId), everyone has access
    if (!requiresApproval) {
      return {
        status: undefined,
        isPending: false,
        isApproved: true, // No approval required = effectively approved
        isRejected: false,
        requiresApproval: false,
        ownerId,
      };
    }

    // User not authenticated - they are pending until they authenticate
    if (!userId) {
      return {
        status: 'pending',
        isPending: true,
        isApproved: false,
        isRejected: false,
        requiresApproval: true,
        ownerId,
      };
    }

    // Check rejection first (rejected takes precedence)
    if (isUserRejected(ydoc, userId)) {
      return {
        status: 'rejected',
        isPending: false,
        isApproved: false,
        isRejected: true,
        requiresApproval: true,
        ownerId,
      };
    }

    // Check if user is approved (owner is always approved)
    if (isUserApproved(ydoc, userId)) {
      return {
        status: 'approved',
        isPending: false,
        isApproved: true,
        isRejected: false,
        requiresApproval: true,
        ownerId,
      };
    }

    // User is pending approval
    return {
      status: 'pending',
      isPending: true,
      isApproved: false,
      isRejected: false,
      requiresApproval: true,
      ownerId,
    };
  }, [ydoc, userId]);

  // Use useSyncExternalStore for safe concurrent rendering
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
