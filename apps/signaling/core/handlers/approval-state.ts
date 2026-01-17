/**
 * Approval state handler for signaling server.
 *
 * Handles approval_state messages from plan owners.
 * Validates ownership, merges approved users (for race condition handling),
 * and persists state to storage.
 */

export { handleApprovalState };

import type { PlatformAdapter } from '../platform.js';
import type { ApprovalStateMessage, PlanApprovalState } from '../types.js';

/**
 * Handle approval_state message from owner.
 * Validates sender is the owner and merges approved users to handle race conditions.
 *
 * Race condition handling:
 * - Guest may redeem invite before owner connects
 * - Owner's approval state must merge with existing approved users from invite redemptions
 * - This prevents approved guests from losing access when owner pushes state
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the sender
 * @param message - Approval state message from owner
 */
async function handleApprovalState(
  platform: PlatformAdapter,
  ws: unknown,
  message: ApprovalStateMessage
): Promise<void> {
  // Handle race condition: approval_state may arrive before subscribe message
  // Infer userId from ownerId in the message (owner is the sender)
  let userId = platform.getUserId(ws);
  if (!userId && message.ownerId) {
    userId = message.ownerId;
    platform.setUserId(ws, userId);
    platform.info('[handleApprovalState] Inferred userId from ownerId', { userId });
  }

  platform.info('[handleApprovalState] Processing approval state', {
    planId: message.planId,
    ownerId: message.ownerId,
    userId,
    approvedCount: message.approvedUsers.length,
    rejectedCount: message.rejectedUsers.length,
  });

  if (!userId) {
    platform.warn('[handleApprovalState] No userId even after inference - rejecting');
    return;
  }

  const existingApproval = await platform.getApprovalState(message.planId);

  // Validate sender is the owner for existing plans
  if (existingApproval && existingApproval.ownerId !== userId) {
    platform.warn('[handleApprovalState] Rejected: sender is not owner', {
      userId,
      existingOwnerId: existingApproval.ownerId,
    });
    return;
  }

  // For new plans, validate sender matches claimed ownerId (first setter wins)
  if (!existingApproval && message.ownerId !== userId) {
    platform.warn('[handleApprovalState] Rejected: sender claims to be different owner', {
      userId,
      claimedOwnerId: message.ownerId,
    });
    return;
  }

  // MERGE approved users from existing state (preserves invite redemptions)
  // This handles the race condition where guest redeems before owner connects
  const mergedApprovedUsers = new Set([
    ...message.approvedUsers,
    ...(existingApproval?.approvedUsers ?? []),
  ]);

  // Don't include rejected users in approved list
  const rejectedSet = new Set(message.rejectedUsers);
  const finalApprovedUsers = Array.from(mergedApprovedUsers).filter(
    (user) => !rejectedSet.has(user)
  );

  const approvalState: PlanApprovalState = {
    planId: message.planId,
    ownerId: message.ownerId,
    approvedUsers: finalApprovedUsers,
    rejectedUsers: message.rejectedUsers,
    lastUpdated: Date.now(),
  };

  await platform.setApprovalState(message.planId, approvalState);

  platform.info('[handleApprovalState] Approval state updated', {
    planId: message.planId,
    approvedCount: finalApprovedUsers.length,
    rejectedCount: message.rejectedUsers.length,
  });
}
