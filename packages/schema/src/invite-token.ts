import { z } from 'zod';
import { ROUTES } from './routes.js';

/**
 * Invite token for time-limited P2P room access.
 * Stored server-side only (not in CRDT) to prevent client manipulation.
 */
export interface InviteToken {
  /** Token ID (8 chars) - used for URL lookup */
  id: string;
  /** SHA256 hash of the actual token value - never store raw token */
  tokenHash: string;
  /** Plan ID this token is for */
  planId: string;
  /** GitHub username of creator (plan owner) */
  createdBy: string;
  /** Unix timestamp when created */
  createdAt: number;
  /** Unix timestamp when token expires */
  expiresAt: number;
  /** Max number of times token can be used (null = unlimited) */
  maxUses: number | null;
  /** Current number of times token has been used */
  useCount: number;
  /** Whether token has been manually revoked */
  revoked: boolean;
  /** Optional label for the invite (e.g., "Team review", "PR #42") */
  label?: string;
  /** Version for optimistic locking (prevents TOCTOU race conditions) */
  version: number;
}

export const InviteTokenSchema = z.object({
  id: z.string(),
  tokenHash: z.string(),
  planId: z.string(),
  createdBy: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  maxUses: z.number().nullable(),
  useCount: z.number(),
  revoked: z.boolean(),
  label: z.string().optional(),
  version: z.number(),
});

/**
 * Record of who redeemed an invite token.
 */
export interface InviteRedemption {
  /** User who redeemed */
  redeemedBy: string;
  /** When redeemed */
  redeemedAt: number;
  /** Token ID that was redeemed */
  tokenId: string;
}

export const InviteRedemptionSchema = z.object({
  redeemedBy: z.string(),
  redeemedAt: z.number(),
  tokenId: z.string(),
});

/**
 * Request to create a new invite token (owner only).
 */
export interface CreateInviteRequest {
  type: 'create_invite';
  planId: string;
  /** GitHub OAuth token for authentication */
  authToken: string;
  /** TTL in minutes (default: 30) */
  ttlMinutes?: number;
  /** Max uses (null = unlimited, default: null) */
  maxUses?: number | null;
  /** Optional label */
  label?: string;
}

/**
 * Response with created invite token.
 * tokenValue is only sent once - store it immediately!
 */
export interface InviteCreatedResponse {
  type: 'invite_created';
  tokenId: string;
  /** The actual token value - only sent once on creation! */
  tokenValue: string;
  expiresAt: number;
  maxUses: number | null;
  label?: string;
}

/**
 * Request to redeem an invite token (guest).
 */
export interface RedeemInviteRequest {
  type: 'redeem_invite';
  planId: string;
  tokenId: string;
  tokenValue: string;
  userId: string;
}

/**
 * Response to invite redemption attempt.
 */
export type InviteRedemptionResult =
  | {
      type: 'invite_redemption_result';
      success: true;
      planId: string;
    }
  | {
      type: 'invite_redemption_result';
      success: false;
      error: 'expired' | 'exhausted' | 'revoked' | 'invalid' | 'already_redeemed';
    };

/**
 * Request to revoke an invite token (owner only).
 */
export interface RevokeInviteRequest {
  type: 'revoke_invite';
  planId: string;
  tokenId: string;
  /** GitHub OAuth token for authentication */
  authToken: string;
}

/**
 * Response to invite revocation.
 */
export interface InviteRevokedResponse {
  type: 'invite_revoked';
  tokenId: string;
  success: boolean;
}

/**
 * Request to list active invites (owner only).
 */
export interface ListInvitesRequest {
  type: 'list_invites';
  planId: string;
  /** GitHub OAuth token for authentication */
  authToken: string;
}

/**
 * Response with active invites list.
 */
export interface InvitesListResponse {
  type: 'invites_list';
  planId: string;
  invites: Array<{
    tokenId: string;
    label?: string;
    expiresAt: number;
    maxUses: number | null;
    useCount: number;
    createdAt: number;
  }>;
}

/**
 * Notification to owner when someone redeems an invite.
 */
export interface InviteRedeemedNotification {
  type: 'invite_redeemed';
  planId: string;
  tokenId: string;
  label?: string;
  redeemedBy: string;
  useCount: number;
  maxUses: number | null;
}

export type InviteSignalingMessage =
  | CreateInviteRequest
  | RedeemInviteRequest
  | RevokeInviteRequest
  | ListInvitesRequest;

export type InviteSignalingResponse =
  | InviteCreatedResponse
  | InviteRedemptionResult
  | InviteRevokedResponse
  | InvitesListResponse
  | InviteRedeemedNotification;

/**
 * Parse invite token from URL query parameter.
 * Format: ?invite={tokenId}:{tokenValue}
 */
export function parseInviteFromUrl(url: string): { tokenId: string; tokenValue: string } | null {
  try {
    const urlObj = new URL(url);
    const inviteParam = urlObj.searchParams.get('invite');
    if (!inviteParam) return null;

    const [tokenId, tokenValue] = inviteParam.split(':');
    if (!tokenId || !tokenValue) return null;

    return { tokenId, tokenValue };
  } catch {
    return null;
  }
}

/**
 * Build invite URL from plan URL and token.
 * baseUrl should include the deployment base path (e.g., https://example.com/shipyard)
 */
export function buildInviteUrl(
  baseUrl: string,
  planId: string,
  tokenId: string,
  tokenValue: string
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBase}${ROUTES.WEB_TASK(planId)}`);
  url.searchParams.set('invite', `${tokenId}:${tokenValue}`);
  return url.toString();
}

/**
 * Calculate time remaining until token expiration.
 */
export function getTokenTimeRemaining(expiresAt: number): {
  expired: boolean;
  minutes: number;
  formatted: string;
} {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return { expired: true, minutes: 0, formatted: 'Expired' };
  }

  const minutes = Math.ceil(remaining / 60000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return {
      expired: false,
      minutes,
      formatted: mins > 0 ? `${hours}h ${mins}m` : `${hours}h`,
    };
  }

  return {
    expired: false,
    minutes,
    formatted: `${minutes}m`,
  };
}
