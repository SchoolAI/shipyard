import type { ApprovalStatus, SyncState } from './useMultiProviderSync';

export interface ApprovalStatusResult {
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
}

/**
 * Hook for accessing user's approval status from sync state.
 * Provides convenient boolean flags for common approval checks.
 */
export function useApprovalStatus(syncState: SyncState): ApprovalStatusResult {
  const { approvalStatus } = syncState;

  return {
    status: approvalStatus,
    isPending: approvalStatus === 'pending',
    isApproved: approvalStatus === 'approved',
    isRejected: approvalStatus === 'rejected',
    requiresApproval: approvalStatus !== undefined,
  };
}
