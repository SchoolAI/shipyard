/**
 * Authenticate handler for signaling server.
 *
 * Two-message authentication pattern:
 * 1. subscribe: y-webrtc sends this automatically, adds to PENDING
 * 2. authenticate: Browser sends this, validates + activates subscription
 *
 * SECURITY: This handler gates ALL data access. A subscription is useless
 * until authenticate succeeds. This prevents unauthorized access to plans.
 */

import type { InviteToken } from '@shipyard/schema';
import type { PlatformAdapter } from '../platform.js';
import {
  type AuthErrorResponse,
  type AuthErrorType,
  type AuthenticatedResponse,
  type AuthenticateMessage,
  AuthenticateMessageSchema,
} from '../types.js';

/**
 * Handle authenticate message from client.
 *
 * Validates credentials and activates pending subscription if valid.
 * This is the second message in the two-message auth pattern.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param rawMessage - Raw message data (needs validation)
 */
export async function handleAuthenticate(
  platform: PlatformAdapter,
  ws: unknown,
  rawMessage: unknown
): Promise<void> {
  const parseResult = AuthenticateMessageSchema.safeParse(rawMessage);
  if (!parseResult.success) {
    sendAuthError(platform, ws, 'invalid_token', 'Invalid authenticate message format');
    return;
  }

  const message: AuthenticateMessage = parseResult.data;

  const pendingTopics = platform.getPendingSubscriptions(ws);
  if (pendingTopics.length === 0) {
    sendAuthError(platform, ws, 'no_pending_subscription', 'No subscription pending');
    return;
  }

  const planTopic = pendingTopics.find((t) => t.startsWith('shipyard-'));
  if (!planTopic) {
    sendAuthError(platform, ws, 'no_pending_subscription', 'No plan subscription pending');
    return;
  }

  const planId = extractPlanId(planTopic);
  if (!planId) {
    sendAuthError(platform, ws, 'no_pending_subscription', 'Invalid plan topic format');
    return;
  }

  switch (message.auth) {
    case 'owner': {
      const result = await validateOwnerAuth(platform, message, planId);
      if (!result.valid) {
        sendAuthError(platform, ws, result.error, result.message);
        return;
      }
      break;
    }

    case 'invite': {
      const result = await validateInviteAuth(platform, message, planId);
      if (!result.valid) {
        sendAuthError(platform, ws, result.error, result.message);
        return;
      }
      break;
    }

    default: {
      const _exhaustive: never = message;
      sendAuthError(
        platform,
        ws,
        'invalid_token',
        `Unknown auth type: ${JSON.stringify(_exhaustive)}`
      );
      return;
    }
  }

  for (const topic of pendingTopics) {
    platform.activatePendingSubscription(ws, topic);
    platform.debug(`[Authenticate] Activated subscription: ${topic}`);
  }

  platform.clearAuthDeadline(ws);
  platform.setConnectionUserId(ws, message.userId);

  sendAuthenticated(platform, ws, message.userId, planId);
  platform.info(`[Authenticate] User ${message.userId} authenticated for plan ${planId}`);
}

/** Result of authentication validation */
type ValidationResult = { valid: true } | { valid: false; error: AuthErrorType; message: string };

/**
 * Validate owner authentication using GitHub token.
 */
async function validateOwnerAuth(
  platform: PlatformAdapter,
  message: Extract<AuthenticateMessage, { auth: 'owner' }>,
  planId: string
): Promise<ValidationResult> {
  const tokenResult = await platform.validateGitHubToken(message.githubToken);
  if (!tokenResult.valid) {
    return {
      valid: false,
      error: 'invalid_token',
      message: tokenResult.error ?? 'Invalid GitHub token',
    };
  }

  if (tokenResult.username !== message.userId) {
    return {
      valid: false,
      error: 'unauthorized',
      message: `Token username (${tokenResult.username}) does not match claimed userId (${message.userId})`,
    };
  }

  /** NOTE: Trust-on-first-use pattern - first authenticated user claims ownership */
  const existingOwnerId = await platform.getPlanOwnerId(planId);
  if (existingOwnerId === null) {
    await platform.setPlanOwnerId(planId, message.userId);
    platform.info(`[Authenticate] Plan ${planId} claimed by ${message.userId}`);
  } else if (existingOwnerId !== message.userId) {
    /** NOTE: Not the owner - check for valid invite redemption */
    const redemption = await platform.getInviteRedemption(planId, message.userId);
    if (!redemption) {
      return {
        valid: false,
        error: 'unauthorized',
        message: `Not authorized for plan ${planId}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate invite authentication using invite token.
 */
async function validateInviteAuth(
  platform: PlatformAdapter,
  message: Extract<AuthenticateMessage, { auth: 'invite' }>,
  planId: string
): Promise<ValidationResult> {
  const { tokenId, tokenValue } = message.inviteToken;

  const token = await platform.getInviteToken(planId, tokenId);
  if (!token) {
    return { valid: false, error: 'invalid_token', message: 'Invite token not found' };
  }

  if (token.revoked) {
    return { valid: false, error: 'revoked', message: 'Invite token has been revoked' };
  }

  if (token.expiresAt < Date.now()) {
    return { valid: false, error: 'expired', message: 'Invite token has expired' };
  }

  if (token.maxUses !== null && token.useCount >= token.maxUses) {
    return { valid: false, error: 'exhausted', message: 'Invite token has no remaining uses' };
  }

  const isValid = await platform.verifyTokenHash(tokenValue, token.tokenHash);
  if (!isValid) {
    return { valid: false, error: 'invalid_token', message: 'Invalid invite token value' };
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
    return { valid: false, error: 'invalid_token', message: 'Token state changed, please retry' };
  }
  await platform.setInviteToken(planId, tokenId, updatedToken);

  await platform.setInviteRedemption(planId, tokenId, message.userId, {
    tokenId,
    redeemedBy: message.userId,
    redeemedAt: Date.now(),
  });

  return { valid: true };
}

/**
 * Extract plan ID from topic name.
 * Topics follow the format: "shipyard-{planId}" for plan documents.
 */
function extractPlanId(topic: string): string | null {
  const prefix = 'shipyard-';
  if (topic.startsWith(prefix)) {
    return topic.slice(prefix.length);
  }
  return null;
}

function sendAuthError(
  platform: PlatformAdapter,
  ws: unknown,
  error: AuthErrorType,
  message: string
): void {
  const response: AuthErrorResponse = { type: 'auth_error', error, message };
  platform.sendMessage(ws, response);
}

function sendAuthenticated(
  platform: PlatformAdapter,
  ws: unknown,
  userId: string,
  planId: string
): void {
  const response: AuthenticatedResponse = { type: 'authenticated', userId, planId };
  platform.sendMessage(ws, response);
}
