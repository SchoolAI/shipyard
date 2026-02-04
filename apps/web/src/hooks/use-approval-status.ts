/**
 * Hook for reading user's approval status from Loro task document.
 *
 * Observes the task metadata and re-renders when approval status changes
 * (approvedUsers, rejectedUsers, ownerId, approvalRequired).
 */

import { useDoc } from '@loro-extended/react';
import type { TaskId } from '@shipyard/loro-schema';
import { useTaskHandle } from '@/loro/selectors/task-selectors';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalStatusResult {
  /** User's approval status, undefined if approval not required for this task */
  status: ApprovalStatus | undefined;
  /** Whether the user needs to wait for approval */
  isPending: boolean;
  /** Whether the user has been approved */
  isApproved: boolean;
  /** Whether the user has been rejected */
  isRejected: boolean;
  /** Whether approval is required for this task */
  requiresApproval: boolean;
  /** The task owner's ID */
  ownerId: string | null;
}

/**
 * Determine approval status from task meta and user ID.
 */
function computeApprovalStatus(
  meta: {
    ownerId: string | null;
    approvalRequired: boolean;
    approvedUsers: string[];
    rejectedUsers: string[];
  },
  userId: string | null
): ApprovalStatusResult {
  const { ownerId, approvalRequired, approvedUsers, rejectedUsers } = meta;

  // If approval is not required, everyone has access
  if (!approvalRequired) {
    return {
      status: undefined,
      isPending: false,
      isApproved: true,
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

  // Owner is always approved
  if (ownerId && userId === ownerId) {
    return {
      status: 'approved',
      isPending: false,
      isApproved: true,
      isRejected: false,
      requiresApproval: true,
      ownerId,
    };
  }

  // Check rejection first (rejected takes precedence)
  if (rejectedUsers.includes(userId)) {
    return {
      status: 'rejected',
      isPending: false,
      isApproved: false,
      isRejected: true,
      requiresApproval: true,
      ownerId,
    };
  }

  // Check if user is approved
  if (approvedUsers.includes(userId)) {
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
}

/**
 * Hook for reading user's approval status from Loro task document.
 *
 * @param taskId - The task ID to check approval status for
 * @param userId - The current user's ID (GitHub username or local identity), or null if not authenticated
 */
export function useApprovalStatus(taskId: TaskId, userId: string | null): ApprovalStatusResult {
  const handle = useTaskHandle(taskId);

  return useDoc(handle, (d) => {
    const meta = d.meta;
    return computeApprovalStatus(
      {
        ownerId: meta.ownerId,
        approvalRequired: meta.approvalRequired,
        approvedUsers: meta.approvedUsers,
        rejectedUsers: meta.rejectedUsers,
      },
      userId
    );
  });
}
