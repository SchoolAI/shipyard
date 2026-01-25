/**
 * Subscribe handler for signaling server.
 *
 * Handles client subscription to room topics (plan IDs).
 *
 * For plan rooms (topics starting with 'shipyard-'):
 * - Requires valid invite token for non-owners
 * - Tracks approval status (pending/approved/rejected)
 * - Notifies owner of pending user requests
 *
 * For non-plan rooms: Simple subscription without authentication.
 */

export { handleSubscribe, handleUnsubscribe };

import type { InviteToken } from '@shipyard/schema';
import type { PlanApprovalState, PlatformAdapter } from '../platform.js';
import type {
  SubscribeMessage,
  TokenValidationError,
  UnsubscribeMessage,
} from '../types.js';

/**
 * Extract plan ID from a topic name.
 * Returns null if not a plan topic.
 *
 * Topic formats:
 * - 'shipyard-{planId}' -> plan room
 * - 'shipyard-plan-index-{username}' -> per-user index room
 */
function extractPlanId(topic: string): string | null {
  if (!topic.startsWith('shipyard-')) return null;

  const suffix = topic.slice('shipyard-'.length);

  // Per-user index: 'shipyard-plan-index-{username}'
  // These don't need invite tokens - they're user-specific
  if (suffix.startsWith('plan-index-')) {
    return null; // Not a plan room, it's an index room
  }

  // Regular plan room: 'shipyard-{planId}'
  return suffix;
}

/**
 * Check if a topic is a per-user index room.
 * These rooms are user-specific and don't require invite tokens,
 * but should only be accessible by the user whose index it is.
 */
function extractIndexUsername(topic: string): string | null {
  if (!topic.startsWith('shipyard-plan-index-')) return null;
  return topic.slice('shipyard-plan-index-'.length);
}

/**
 * Validate an invite token.
 * Returns error code or null if valid.
 */
async function validateInviteToken(
  platform: PlatformAdapter,
  token: InviteToken | undefined,
  tokenValue: string
): Promise<TokenValidationError | null> {
  if (!token) return 'invalid';
  if (token.revoked) return 'revoked';
  if (Date.now() > token.expiresAt) return 'expired';
  if (token.maxUses !== null && token.useCount >= token.maxUses) return 'exhausted';

  // Verify token hash
  const isValid = await platform.verifyTokenHash(tokenValue, token.tokenHash);
  if (!isValid) return 'invalid';

  return null;
}

/**
 * Handle subscription to a plan room.
 * Validates token and sets approval status.
 *
 * @returns Object indicating success or error
 */
async function handlePlanSubscription(
  platform: PlatformAdapter,
  ws: unknown,
  planId: string,
  topic: string,
  message: SubscribeMessage
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { userId, inviteToken } = message;

  // User ID is required for plan rooms
  if (!userId) {
    return {
      success: false,
      error: 'user_required',
      message: 'User ID required for plan rooms. Please sign in with GitHub.',
    };
  }

  // Set the connection's user ID
  platform.setConnectionUserId(ws, userId);

  // Check if plan has an owner (uses access control)
  const ownerId = await platform.getPlanOwnerId(planId);

  // No owner = no access control (legacy plan)
  // For now, allow access but log a warning
  if (!ownerId) {
    platform.warn(`[handlePlanSubscription] Plan ${planId} has no owner - allowing unrestricted access`);
    return { success: true };
  }

  // Owner is always approved
  if (userId === ownerId) {
    platform.debug(`[handlePlanSubscription] User ${userId} is owner of plan ${planId}`);
    return { success: true };
  }

  // Get or create approval state
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

  // Check if user is already rejected
  if (approvalState.rejectedUsers.includes(userId)) {
    platform.debug(`[handlePlanSubscription] User ${userId} is rejected from plan ${planId}`);
    return {
      success: false,
      error: 'rejected',
      message: 'Access denied. You have been rejected from this plan.',
    };
  }

  // Check if user is already approved
  if (approvalState.approvedUsers.includes(userId)) {
    platform.debug(`[handlePlanSubscription] User ${userId} is already approved for plan ${planId}`);
    return { success: true };
  }

  // User is not approved - they need a valid invite token to enter waiting room
  if (!inviteToken) {
    return {
      success: false,
      error: 'token_required',
      message: 'Invite token required to access this plan. Please use a shared invite link.',
    };
  }

  // Validate the invite token
  const token = await platform.getInviteToken(planId, inviteToken.tokenId);
  const validationError = await validateInviteToken(platform, token, inviteToken.tokenValue);

  if (validationError) {
    platform.debug(`[handlePlanSubscription] Token validation failed: ${validationError}`);
    return {
      success: false,
      error: validationError,
      message: `Invalid invite token: ${validationError}`,
    };
  }

  // Token is valid - add user to pending list
  platform.debug(`[handlePlanSubscription] User ${userId} entering waiting room for plan ${planId}`);

  // Add to pending users if not already there
  const isAlreadyPending = approvalState.pendingUsers.some((p) => p.userId === userId);
  if (!isAlreadyPending) {
    const now = Date.now();
    const newState: PlanApprovalState = {
      ...approvalState,
      pendingUsers: [...approvalState.pendingUsers, { userId, requestedAt: now }],
    };
    await platform.setPlanApprovalState(planId, newState);

    // Notify owner of new pending user
    await platform.notifyPlanOwner(planId, {
      type: 'pending_user',
      planId,
      userId,
      requestedAt: now,
    });

    platform.info(`[handlePlanSubscription] Notified owner of pending user: ${userId}`);
  }

  // User can subscribe but will only receive awareness messages (not CRDT sync)
  return { success: true };
}

/**
 * Handle subscription to a per-user index room.
 * Only the user whose index it is can access it.
 */
async function handleIndexSubscription(
  platform: PlatformAdapter,
  ws: unknown,
  indexUsername: string,
  topic: string,
  message: SubscribeMessage
): Promise<{ success: boolean; error?: string; message?: string }> {
  const { userId } = message;

  // User ID is required
  if (!userId) {
    return {
      success: false,
      error: 'user_required',
      message: 'User ID required for index rooms. Please sign in with GitHub.',
    };
  }

  // Set the connection's user ID
  platform.setConnectionUserId(ws, userId);

  // Only allow access to your own index
  if (userId !== indexUsername) {
    platform.warn(`[handleIndexSubscription] User ${userId} attempted to access index of ${indexUsername}`);
    return {
      success: false,
      error: 'unauthorized',
      message: 'You can only access your own plan index.',
    };
  }

  // User is accessing their own index - allow full access
  return { success: true };
}

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics.
 *
 * For plan rooms (shipyard-{planId}), validates invite token and sets approval status.
 * For index rooms (shipyard-plan-index-{username}), verifies user owns the index.
 * For other topics, simple subscription without authentication.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics
 */
async function handleSubscribe(
  platform: PlatformAdapter,
  ws: unknown,
  message: SubscribeMessage
): Promise<void> {
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;

    // Check if this is a per-user index room
    const indexUsername = extractIndexUsername(topic);
    if (indexUsername) {
      const result = await handleIndexSubscription(platform, ws, indexUsername, topic, message);
      if (!result.success) {
        platform.sendMessage(ws, {
          type: 'error',
          error: result.error,
          message: result.message,
        });
        continue; // Don't subscribe to this topic
      }
    } else {
      // Check if this is a plan room
      const planId = extractPlanId(topic);
      if (planId) {
        const result = await handlePlanSubscription(platform, ws, planId, topic, message);
        if (!result.success) {
          platform.sendMessage(ws, {
            type: 'error',
            error: result.error,
            message: result.message,
          });
          continue; // Don't subscribe to this topic
        }
      }
    }

    // Subscribe to the topic
    platform.subscribeToTopic(ws, topic);

    // Log subscription for debugging
    const subscriberCount = platform.getTopicSubscribers(topic).length;
    platform.debug(`[Subscribe] Client subscribed to topic: ${topic} (now ${subscriberCount} subscribers)`);
  }
}

/**
 * Handle unsubscribe message from client.
 * Unsubscribes the client from the specified topics.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Unsubscribe message with topics
 */
function handleUnsubscribe(
  platform: PlatformAdapter,
  ws: unknown,
  message: UnsubscribeMessage
): void {
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.unsubscribeFromTopic(ws, topic);
  }
}
