/**
 * Approval handlers for signaling server.
 *
 * Handles owner approval/rejection of pending users:
 * - approve_user: Grant user full access to plan content
 * - reject_user: Deny user access and remove from room
 */

export { handleApproveUser, handleRejectUser };

import type { PlanApprovalState, PlatformAdapter } from '../platform.js';
import type { ApproveUserRequest, RejectUserRequest } from '../types.js';

/**
 * Send an error response to the client.
 */
function sendErrorResponse(
  platform: PlatformAdapter,
  ws: unknown,
  error: string,
  message: string
): void {
  platform.sendMessage(ws, {
    type: 'error',
    error,
    message,
  });
}

/**
 * Handle approve_user message from plan owner.
 * Moves user from pending to approved list and notifies them.
 *
 * Security: Requires valid GitHub auth token and plan ownership verification.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the owner
 * @param message - Approve user request
 */
async function handleApproveUser(
  platform: PlatformAdapter,
  ws: unknown,
  message: ApproveUserRequest
): Promise<void> {
  const { planId, userId, authToken } = message;

  platform.info('[handleApproveUser] Processing approve request', { planId, userId });

  // --- Authentication: Validate GitHub token ---
  if (!authToken) {
    platform.warn('[handleApproveUser] Missing auth token');
    sendErrorResponse(platform, ws, 'unauthenticated', 'Authentication required.');
    return;
  }

  const authResult = await platform.validateGitHubToken(authToken);
  if (!authResult.valid || !authResult.username) {
    platform.warn('[handleApproveUser] Invalid auth token');
    sendErrorResponse(platform, ws, 'unauthenticated', authResult.error ?? 'Invalid token');
    return;
  }

  // --- Authorization: Verify requester is plan owner ---
  const ownerId = await platform.getPlanOwnerId(planId);
  if (!ownerId) {
    platform.warn('[handleApproveUser] Plan not found', { planId });
    sendErrorResponse(platform, ws, 'plan_not_found', 'Plan not found or has no owner.');
    return;
  }

  if (authResult.username !== ownerId) {
    platform.warn('[handleApproveUser] Unauthorized - not owner', {
      requester: authResult.username,
      owner: ownerId,
    });
    sendErrorResponse(platform, ws, 'unauthorized', 'Only the plan owner can approve users.');
    return;
  }

  // --- Update approval state ---
  const topic = `shipyard-${planId}`;
  let approvalState = await platform.getPlanApprovalState(planId);

  if (!approvalState) {
    approvalState = {
      planId,
      ownerId,
      approvedUsers: [],
      rejectedUsers: [],
      pendingUsers: [],
    };
  }

  // Check if user is already approved
  if (approvalState.approvedUsers.includes(userId)) {
    platform.debug('[handleApproveUser] User already approved', { userId });
    platform.sendMessage(ws, {
      type: 'user_approved',
      planId,
      userId,
    });
    return;
  }

  // Move user from pending to approved
  const newState: PlanApprovalState = {
    ...approvalState,
    approvedUsers: [...new Set([...approvalState.approvedUsers, userId])],
    pendingUsers: approvalState.pendingUsers.filter((p) => p.userId !== userId),
    rejectedUsers: approvalState.rejectedUsers.filter((id) => id !== userId), // Remove from rejected if was there
  };

  await platform.setPlanApprovalState(planId, newState);

  // --- Notify the approved user ---
  platform.broadcastToTopic(
    topic,
    {
      type: 'approval_status',
      planId,
      userId,
      status: 'approved',
    },
    (sub) => platform.getConnectionUserId(sub) === userId
  );

  // --- Confirm to owner ---
  platform.sendMessage(ws, {
    type: 'user_approved',
    planId,
    userId,
  });

  platform.info('[handleApproveUser] User approved successfully', { planId, userId });
}

/**
 * Handle reject_user message from plan owner.
 * Moves user to rejected list and notifies them.
 *
 * Security: Requires valid GitHub auth token and plan ownership verification.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the owner
 * @param message - Reject user request
 */
async function handleRejectUser(
  platform: PlatformAdapter,
  ws: unknown,
  message: RejectUserRequest
): Promise<void> {
  const { planId, userId, authToken } = message;

  platform.info('[handleRejectUser] Processing reject request', { planId, userId });

  // --- Authentication: Validate GitHub token ---
  if (!authToken) {
    platform.warn('[handleRejectUser] Missing auth token');
    sendErrorResponse(platform, ws, 'unauthenticated', 'Authentication required.');
    return;
  }

  const authResult = await platform.validateGitHubToken(authToken);
  if (!authResult.valid || !authResult.username) {
    platform.warn('[handleRejectUser] Invalid auth token');
    sendErrorResponse(platform, ws, 'unauthenticated', authResult.error ?? 'Invalid token');
    return;
  }

  // --- Authorization: Verify requester is plan owner ---
  const ownerId = await platform.getPlanOwnerId(planId);
  if (!ownerId) {
    platform.warn('[handleRejectUser] Plan not found', { planId });
    sendErrorResponse(platform, ws, 'plan_not_found', 'Plan not found or has no owner.');
    return;
  }

  if (authResult.username !== ownerId) {
    platform.warn('[handleRejectUser] Unauthorized - not owner', {
      requester: authResult.username,
      owner: ownerId,
    });
    sendErrorResponse(platform, ws, 'unauthorized', 'Only the plan owner can reject users.');
    return;
  }

  // --- Update approval state ---
  const topic = `shipyard-${planId}`;
  let approvalState = await platform.getPlanApprovalState(planId);

  if (!approvalState) {
    approvalState = {
      planId,
      ownerId,
      approvedUsers: [],
      rejectedUsers: [],
      pendingUsers: [],
    };
  }

  // Move user to rejected list
  const newState: PlanApprovalState = {
    ...approvalState,
    rejectedUsers: [...new Set([...approvalState.rejectedUsers, userId])],
    pendingUsers: approvalState.pendingUsers.filter((p) => p.userId !== userId),
    approvedUsers: approvalState.approvedUsers.filter((id) => id !== userId), // Remove from approved if was there
  };

  await platform.setPlanApprovalState(planId, newState);

  // --- Notify the rejected user ---
  platform.broadcastToTopic(
    topic,
    {
      type: 'approval_status',
      planId,
      userId,
      status: 'rejected',
    },
    (sub) => platform.getConnectionUserId(sub) === userId
  );

  // --- Confirm to owner ---
  platform.sendMessage(ws, {
    type: 'user_rejected',
    planId,
    userId,
  });

  platform.info('[handleRejectUser] User rejected successfully', { planId, userId });
}
