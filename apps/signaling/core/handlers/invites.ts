/**
 * Invite token handlers for signaling server.
 *
 * Handles all invite-related operations:
 * - create_invite: Owner creates time-limited invite token
 * - redeem_invite: Guest redeems invite token (auto-approves)
 * - revoke_invite: Owner revokes an invite token
 * - list_invites: Owner lists active invites for a plan
 */

export { handleCreateInvite, handleListInvites, handleRedeemInvite, handleRevokeInvite };

import type { InviteToken } from '@shipyard/schema';
import type { PlatformAdapter } from '../platform.js';
import type {
  CreateInviteRequest,
  InviteCreatedResponse,
  InviteRedeemedNotification,
  InviteRedemption,
  InviteRedemptionResult,
  InviteRevokedResponse,
  InvitesListResponse,
  ListInvitesRequest,
  PlanApprovalState,
  RedeemInviteRequest,
  RevokeInviteRequest,
  TokenValidationError,
} from '../types.js';

/**
 * Topic prefix for plan documents.
 */
const PLAN_TOPIC_PREFIX = 'shipyard-';

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
 * Auto-approve a user after invite redemption.
 * Creates approval state if it doesn't exist (handles race condition where
 * guest arrives before owner).
 */
async function autoApproveUserFromInvite(
  platform: PlatformAdapter,
  planId: string,
  userId: string,
  token: InviteToken
): Promise<void> {
  let approval = await platform.getApprovalState(planId);

  // If no approval state yet, create one from token metadata
  // This handles the race condition where guest arrives before owner
  if (!approval) {
    approval = {
      planId,
      ownerId: token.createdBy,
      approvedUsers: [token.createdBy], // Owner is always approved
      rejectedUsers: [],
      lastUpdated: Date.now(),
    };
  }

  // Add user to approved list if not already present
  if (!approval.approvedUsers.includes(userId)) {
    approval.approvedUsers.push(userId);
    approval.lastUpdated = Date.now();
  }

  // Remove from rejected list if present
  const rejectedIndex = approval.rejectedUsers.indexOf(userId);
  if (rejectedIndex !== -1) {
    approval.rejectedUsers.splice(rejectedIndex, 1);
  }

  await platform.setApprovalState(planId, approval);
}

/**
 * Notify owner that invite was redeemed.
 * Sends notification to all owner's connected WebSockets.
 */
function notifyOwnerOfRedemption(
  platform: PlatformAdapter,
  approval: PlanApprovalState,
  planId: string,
  token: InviteToken,
  redeemedBy: string
): void {
  const notification: InviteRedeemedNotification = {
    type: 'invite_redeemed',
    planId,
    tokenId: token.id,
    label: token.label,
    redeemedBy,
    useCount: token.useCount,
    maxUses: token.maxUses,
  };

  // Find owner's connections and send notification
  const topic = `${PLAN_TOPIC_PREFIX}${planId}`;
  const subscribers = platform.getTopicSubscribers(topic);

  for (const ws of subscribers) {
    const wsUserId = platform.getUserId(ws);
    if (wsUserId === approval.ownerId) {
      platform.sendMessage(ws, notification);
    }
  }
}

/**
 * Handle create_invite message from owner.
 * Creates a new time-limited invite token.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the owner
 * @param message - Create invite request
 */
async function handleCreateInvite(
  platform: PlatformAdapter,
  ws: unknown,
  message: CreateInviteRequest
): Promise<void> {
  const userId = platform.getUserId(ws);

  platform.info('[handleCreateInvite] Processing create invite request', {
    planId: message.planId,
    userId,
  });

  if (!userId) {
    platform.warn('[handleCreateInvite] No userId - unauthenticated');
    platform.sendMessage(ws, { type: 'error', error: 'unauthenticated' });
    return;
  }

  const approval = await platform.getApprovalState(message.planId);

  platform.info('[handleCreateInvite] Approval check', {
    hasApproval: !!approval,
    ownerId: approval?.ownerId,
    userId,
    matches: approval?.ownerId === userId,
  });

  if (!approval || approval.ownerId !== userId) {
    platform.warn('[handleCreateInvite] Not owner or no approval state');
    platform.sendMessage(ws, { type: 'error', error: 'not_owner' });
    return;
  }

  // Generate token components
  const tokenId = await platform.generateTokenId();
  const tokenValue = await platform.generateTokenValue();
  const tokenHash = await platform.hashTokenValue(tokenValue);

  const now = Date.now();
  const ttlMs = (message.ttlMinutes ?? 30) * 60 * 1000;

  const token: InviteToken = {
    id: tokenId,
    tokenHash,
    planId: message.planId,
    createdBy: userId,
    createdAt: now,
    expiresAt: now + ttlMs,
    maxUses: message.maxUses ?? null,
    useCount: 0,
    revoked: false,
    label: message.label,
  };

  // Store the token using planId and tokenId
  await platform.setInviteToken(message.planId, tokenId, token);

  platform.info('[handleCreateInvite] Created invite token', {
    tokenId,
    planId: message.planId,
    ttlMinutes: message.ttlMinutes ?? 30,
  });

  // Send response with token value (only time it's sent!)
  const response: InviteCreatedResponse = {
    type: 'invite_created',
    tokenId,
    tokenValue, // Only sent once!
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    label: token.label,
  };
  platform.sendMessage(ws, response);
}

/**
 * Flush queued messages for a newly-approved user.
 * Called after invite redemption to deliver messages that were queued
 * before the user was approved.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection to flush
 * @param planId - Plan ID to flush messages for
 */
async function flushMessagesAfterApproval(
  platform: PlatformAdapter,
  ws: unknown,
  planId: string
): Promise<void> {
  // Mark connection as flushing to prevent race conditions with handlePublish
  platform.setFlushingMessages(ws, true);

  try {
    const queuedByTopic = platform.getAndClearQueuedMessages(ws);

    if (queuedByTopic.size === 0) return;

    const topic = `${PLAN_TOPIC_PREFIX}${planId}`;
    const messages = queuedByTopic.get(topic);

    if (messages && messages.length > 0) {
      platform.debug('[flushMessagesAfterApproval] Delivering queued messages', {
        planId,
        messageCount: messages.length,
      });

      for (const msg of messages) {
        platform.sendMessage(ws, msg);
      }
    }

    // Re-queue messages for other topics (shouldn't happen, but be safe)
    for (const [otherTopic, otherMessages] of queuedByTopic) {
      if (otherTopic !== topic) {
        for (const msg of otherMessages) {
          platform.queueMessageForConnection(ws, otherTopic, msg);
        }
      }
    }
  } finally {
    platform.setFlushingMessages(ws, false);
  }
}

/**
 * Handle redeem_invite message from guest.
 * Validates token and auto-approves the user if valid.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the guest
 * @param message - Redeem invite request
 */
async function handleRedeemInvite(
  platform: PlatformAdapter,
  ws: unknown,
  message: RedeemInviteRequest
): Promise<void> {
  const { planId, tokenId, tokenValue, userId } = message;

  const token = await platform.getInviteToken(planId, tokenId);
  const error = await validateInviteToken(platform, token, tokenValue);

  if (error) {
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: false,
      error,
    };
    platform.sendMessage(ws, response);
    return;
  }

  // Check if already redeemed by this user (idempotent)
  const existingRedemption = await platform.getInviteRedemption(planId, userId);

  if (existingRedemption) {
    // Already redeemed - return success (idempotent)
    // Also flush any queued messages in case they reconnected
    await flushMessagesAfterApproval(platform, ws, planId);
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: true,
      planId,
    };
    platform.sendMessage(ws, response);
    return;
  }

  // Token is guaranteed non-null here since validateInviteToken returned null
  const validToken = token as InviteToken;

  // Increment use count
  validToken.useCount++;
  await platform.setInviteToken(planId, tokenId, validToken);

  // Record redemption (key includes tokenId to allow multiple token redemptions per user)
  const redemption: InviteRedemption = {
    redeemedBy: userId,
    redeemedAt: Date.now(),
    tokenId,
  };
  await platform.setInviteRedemption(planId, tokenId, userId, redemption);

  // Auto-approve user
  await autoApproveUserFromInvite(platform, planId, userId, validToken);

  // Flush queued messages now that user is approved
  // This is critical: messages were queued during initial subscribe (before userId was set)
  // and re-queued during first flush (before user was approved). Now we can deliver them.
  await flushMessagesAfterApproval(platform, ws, planId);

  platform.info('[handleRedeemInvite] User redeemed invite token', { userId, tokenId, planId });

  // Send success to guest
  const response: InviteRedemptionResult = {
    type: 'invite_redemption_result',
    success: true,
    planId,
  };
  platform.sendMessage(ws, response);

  // Notify owner
  const approval = await platform.getApprovalState(planId);
  if (approval) {
    notifyOwnerOfRedemption(platform, approval, planId, validToken, userId);
  }
}

/**
 * Handle revoke_invite message from owner.
 * Marks the invite as revoked (prevents future redemptions).
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the owner
 * @param message - Revoke invite request
 */
async function handleRevokeInvite(
  platform: PlatformAdapter,
  ws: unknown,
  message: RevokeInviteRequest
): Promise<void> {
  const userId = platform.getUserId(ws);

  if (!userId) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    platform.sendMessage(ws, response);
    return;
  }

  const approval = await platform.getApprovalState(message.planId);
  if (!approval || approval.ownerId !== userId) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    platform.sendMessage(ws, response);
    return;
  }

  const token = await platform.getInviteToken(message.planId, message.tokenId);

  if (!token) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    platform.sendMessage(ws, response);
    return;
  }

  // Mark as revoked
  token.revoked = true;
  await platform.setInviteToken(message.planId, message.tokenId, token);

  platform.info('[handleRevokeInvite] Revoked invite token', {
    tokenId: message.tokenId,
    planId: message.planId,
  });

  const response: InviteRevokedResponse = {
    type: 'invite_revoked',
    tokenId: message.tokenId,
    success: true,
  };
  platform.sendMessage(ws, response);
}

/**
 * Handle list_invites message from owner.
 * Returns list of active (non-expired, non-revoked) invites.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the owner
 * @param message - List invites request
 */
async function handleListInvites(
  platform: PlatformAdapter,
  ws: unknown,
  message: ListInvitesRequest
): Promise<void> {
  const userId = platform.getUserId(ws);

  if (!userId) {
    const response: InvitesListResponse = {
      type: 'invites_list',
      planId: message.planId,
      invites: [],
    };
    platform.sendMessage(ws, response);
    return;
  }

  const approval = await platform.getApprovalState(message.planId);
  if (!approval || approval.ownerId !== userId) {
    const response: InvitesListResponse = {
      type: 'invites_list',
      planId: message.planId,
      invites: [],
    };
    platform.sendMessage(ws, response);
    return;
  }

  const now = Date.now();
  const allTokens = await platform.listInviteTokens(message.planId);

  // Filter to active invites only
  const invites: InvitesListResponse['invites'] = [];
  for (const token of allTokens) {
    if (token.revoked) continue;
    if (token.expiresAt < now) continue;
    if (token.maxUses !== null && token.useCount >= token.maxUses) continue;

    invites.push({
      tokenId: token.id,
      label: token.label,
      expiresAt: token.expiresAt,
      maxUses: token.maxUses,
      useCount: token.useCount,
      createdAt: token.createdAt,
    });
  }

  const response: InvitesListResponse = {
    type: 'invites_list',
    planId: message.planId,
    invites,
  };
  platform.sendMessage(ws, response);
}
