/**
 * Invite token handlers for signaling server.
 *
 * Handles all invite-related operations:
 * - create_invite: Create time-limited invite token
 * - redeem_invite: Redeem invite token
 * - revoke_invite: Revoke an invite token
 * - list_invites: List active invites for a plan
 *
 * Note: Simplified version - no approval state enforcement.
 * Invites are for tracking who was invited, not for access control.
 */

export { handleCreateInvite, handleListInvites, handleRedeemInvite, handleRevokeInvite };

import type { InviteToken } from '@shipyard/schema';
import type { PlatformAdapter } from '../platform.js';
import type {
  CreateInviteRequest,
  InviteCreatedResponse,
  InviteRedemption,
  InviteRedemptionResult,
  InviteRevokedResponse,
  InvitesListResponse,
  ListInvitesRequest,
  RedeemInviteRequest,
  RevokeInviteRequest,
  TokenValidationError,
} from '../types.js';

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

  /** Verify token hash */
  const isValid = await platform.verifyTokenHash(tokenValue, token.tokenHash);
  if (!isValid) return 'invalid';

  return null;
}

/**
 * Send an error response to the client.
 */
function sendErrorResponse(
  platform: PlatformAdapter,
  ws: unknown,
  error: 'unauthenticated' | 'unauthorized' | 'plan_not_found',
  message: string
): void {
  platform.sendMessage(ws, {
    type: 'error',
    error,
    message,
  });
}

/**
 * Handle create_invite message.
 * Creates a new time-limited invite token.
 *
 * Security: Requires valid GitHub auth token and plan ownership verification.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection
 * @param message - Create invite request
 */
async function handleCreateInvite(
  platform: PlatformAdapter,
  ws: unknown,
  message: CreateInviteRequest
): Promise<void> {
  platform.info('[handleCreateInvite] Processing create invite request', {
    planId: message.planId,
  });

  /** --- Authentication: Validate GitHub token --- */
  if (!message.authToken) {
    platform.warn('[handleCreateInvite] Missing auth token');
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      'Authentication required. Please sign in with GitHub.'
    );
    return;
  }

  const authResult = await platform.validateGitHubToken(message.authToken);
  if (!authResult.valid || !authResult.username) {
    platform.warn('[handleCreateInvite] Invalid auth token', {
      error: authResult.error,
    });
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      authResult.error || 'Invalid GitHub token. Please sign in again.'
    );
    return;
  }

  const authenticatedUser = authResult.username;
  platform.info('[handleCreateInvite] Authenticated user', { username: authenticatedUser });

  /** --- Authorization: Check plan ownership --- */
  const existingOwnerId = await platform.getPlanOwnerId(message.planId);

  if (existingOwnerId) {
    /** Plan has an existing owner - verify the authenticated user is the owner */
    if (existingOwnerId !== authenticatedUser) {
      platform.warn('[handleCreateInvite] User is not the plan owner', {
        authenticatedUser,
        planOwner: existingOwnerId,
        planId: message.planId,
      });
      sendErrorResponse(
        platform,
        ws,
        'unauthorized',
        'Only the plan owner can create invite links.'
      );
      return;
    }
  } else {
    /** No existing owner - trust-on-first-use: record this user as owner */
    platform.info('[handleCreateInvite] Recording plan owner (first invite)', {
      planId: message.planId,
      ownerId: authenticatedUser,
    });
    await platform.setPlanOwnerId(message.planId, authenticatedUser);
  }

  /** --- Create the invite token --- */
  const tokenId = await platform.generateTokenId();
  const tokenValue = await platform.generateTokenValue();
  const tokenHash = await platform.hashTokenValue(tokenValue);

  const now = Date.now();
  const ttlMs = (message.ttlMinutes ?? 30) * 60 * 1000;

  const token: InviteToken = {
    id: tokenId,
    tokenHash,
    planId: message.planId,
    createdBy: authenticatedUser,
    createdAt: now,
    expiresAt: now + ttlMs,
    maxUses: message.maxUses ?? null,
    useCount: 0,
    revoked: false,
    label: message.label,
    version: 0,
  };

  /** Store the token using planId and tokenId */
  await platform.setInviteToken(message.planId, tokenId, token);

  platform.info('[handleCreateInvite] Created invite token', {
    tokenId,
    planId: message.planId,
    createdBy: authenticatedUser,
    ttlMinutes: message.ttlMinutes ?? 30,
  });

  /** Send response with token value (only time it's sent!) */
  const response: InviteCreatedResponse = {
    type: 'invite_created',
    tokenId,
    tokenValue /** Only sent once! */,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    label: token.label,
  };
  platform.sendMessage(ws, response);
}

/**
 * Handle redeem_invite message.
 * Validates token and records the redemption.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection
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

  /**
   * Explicit check to satisfy TypeScript's control flow analysis.
   * validateInviteToken returns 'invalid' for undefined tokens which
   * we've already handled above, so this branch is unreachable.
   */
  if (!token) {
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: false,
      error: 'invalid',
    };
    platform.sendMessage(ws, response);
    return;
  }

  const existingRedemption = await platform.getSpecificInviteRedemption(planId, tokenId, userId);

  if (existingRedemption) {
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: true,
      planId,
    };
    platform.sendMessage(ws, response);
    return;
  }

  /** Atomic compare-and-swap with optimistic locking to prevent TOCTOU race */
  const currentVersion = token.version;
  const updatedToken: InviteToken = {
    ...token,
    useCount: token.useCount + 1,
    version: token.version + 1,
  };

  /** Verify token hasn't changed since we read it */
  const existing = await platform.getInviteToken(planId, tokenId);
  if (!existing || existing.version !== currentVersion) {
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: false,
      error: 'invalid',
    };
    platform.sendMessage(ws, response);
    return;
  }
  await platform.setInviteToken(planId, tokenId, updatedToken);

  /** Record redemption (key includes tokenId to allow multiple token redemptions per user) */
  const redemption: InviteRedemption = {
    redeemedBy: userId,
    redeemedAt: Date.now(),
    tokenId,
  };
  await platform.setInviteRedemption(planId, tokenId, userId, redemption);

  platform.info('[handleRedeemInvite] User redeemed invite token', { userId, tokenId, planId });

  /** Send success to guest */
  const response: InviteRedemptionResult = {
    type: 'invite_redemption_result',
    success: true,
    planId,
  };
  platform.sendMessage(ws, response);
}

/**
 * Handle revoke_invite message.
 * Marks the invite as revoked (prevents future redemptions).
 *
 * Security: Requires valid GitHub auth token and plan ownership verification.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection
 * @param message - Revoke invite request
 */
async function handleRevokeInvite(
  platform: PlatformAdapter,
  ws: unknown,
  message: RevokeInviteRequest
): Promise<void> {
  /** --- Authentication: Validate GitHub token --- */
  if (!message.authToken) {
    platform.warn('[handleRevokeInvite] Missing auth token');
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      'Authentication required. Please sign in with GitHub.'
    );
    return;
  }

  const authResult = await platform.validateGitHubToken(message.authToken);
  if (!authResult.valid || !authResult.username) {
    platform.warn('[handleRevokeInvite] Invalid auth token', {
      error: authResult.error,
    });
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      authResult.error || 'Invalid GitHub token. Please sign in again.'
    );
    return;
  }

  const authenticatedUser = authResult.username;

  /** --- Authorization: Check plan ownership --- */
  const existingOwnerId = await platform.getPlanOwnerId(message.planId);
  if (!existingOwnerId) {
    platform.warn('[handleRevokeInvite] Plan has no owner', {
      planId: message.planId,
    });
    sendErrorResponse(platform, ws, 'plan_not_found', 'Plan not found.');
    return;
  }

  if (existingOwnerId !== authenticatedUser) {
    platform.warn('[handleRevokeInvite] User is not the plan owner', {
      authenticatedUser,
      planOwner: existingOwnerId,
      planId: message.planId,
    });
    sendErrorResponse(platform, ws, 'unauthorized', 'Only the plan owner can revoke invites.');
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

  /** Mark as revoked with version increment */
  const updatedToken: InviteToken = {
    ...token,
    revoked: true,
    version: token.version + 1,
  };
  await platform.setInviteToken(message.planId, message.tokenId, updatedToken);

  platform.info('[handleRevokeInvite] Revoked invite token', {
    tokenId: message.tokenId,
    planId: message.planId,
    revokedBy: authenticatedUser,
  });

  const response: InviteRevokedResponse = {
    type: 'invite_revoked',
    tokenId: message.tokenId,
    success: true,
  };
  platform.sendMessage(ws, response);
}

/**
 * Handle list_invites message.
 * Returns list of active (non-expired, non-revoked) invites.
 *
 * Security: Requires valid GitHub auth token and plan ownership verification.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection
 * @param message - List invites request
 */
async function handleListInvites(
  platform: PlatformAdapter,
  ws: unknown,
  message: ListInvitesRequest
): Promise<void> {
  /** --- Authentication: Validate GitHub token --- */
  if (!message.authToken) {
    platform.warn('[handleListInvites] Missing auth token');
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      'Authentication required. Please sign in with GitHub.'
    );
    return;
  }

  const authResult = await platform.validateGitHubToken(message.authToken);
  if (!authResult.valid || !authResult.username) {
    platform.warn('[handleListInvites] Invalid auth token', {
      error: authResult.error,
    });
    sendErrorResponse(
      platform,
      ws,
      'unauthenticated',
      authResult.error || 'Invalid GitHub token. Please sign in again.'
    );
    return;
  }

  const authenticatedUser = authResult.username;

  /** --- Authorization: Check plan ownership --- */
  const existingOwnerId = await platform.getPlanOwnerId(message.planId);
  if (!existingOwnerId) {
    platform.warn('[handleListInvites] Plan has no owner', {
      planId: message.planId,
    });
    sendErrorResponse(platform, ws, 'plan_not_found', 'Plan not found.');
    return;
  }

  if (existingOwnerId !== authenticatedUser) {
    platform.warn('[handleListInvites] User is not the plan owner', {
      authenticatedUser,
      planOwner: existingOwnerId,
      planId: message.planId,
    });
    sendErrorResponse(platform, ws, 'unauthorized', 'Only the plan owner can list invites.');
    return;
  }

  const now = Date.now();
  const allTokens = await platform.listInviteTokens(message.planId);

  /** Filter to active invites only */
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
