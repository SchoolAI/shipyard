#!/usr/bin/env node

/**
 * Local development signaling server for y-webrtc P2P connections.
 *
 * Implements the y-webrtc signaling protocol:
 * - subscribe: Client subscribes to room topics (plan IDs)
 * - unsubscribe: Client leaves room topics
 * - publish: Broadcast message to all subscribers of a topic
 * - ping/pong: Keepalive
 * - approval_state: Owner pushes approval state for access control
 *
 * Also implements invite token handlers for secure room access:
 * - create_invite: Create time-limited invite token (owner only)
 * - redeem_invite: Redeem an invite token (guest)
 * - revoke_invite: Revoke an invite token (owner only)
 * - list_invites: List active invites (owner only)
 *
 * Access Control:
 * The signaling server enforces approval at the peer discovery layer.
 * When a user is not approved, they cannot discover or connect to other peers.
 * This prevents unapproved users from receiving CRDT data.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import http from 'node:http';
import type {
  ApprovalStateMessage,
  CreateInviteRequest,
  ErrorMessage,
  InviteCreatedResponse,
  InviteRedeemedNotification,
  InviteRedemption,
  InviteRedemptionResult,
  InviteRevokedResponse,
  InvitesListResponse,
  InviteToken,
  ListInvitesRequest,
  OutgoingMessage,
  PingMessage,
  PlanApprovalState,
  PongMessage,
  PublishMessage,
  RedeemInviteRequest,
  RevokeInviteRequest,
  SignalingMessage,
  SubscribeMessage,
  TokenValidationError,
  UnsubscribeMessage,
} from '../core/types.js';
import * as map from 'lib0/map';
import { nanoid } from 'nanoid';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  extractPlanId,
  isUserApproved as isUserApprovedBase,
  isUserRejected as isUserRejectedBase,
  send,
  WS_READY_STATE_CONNECTING,
  WS_READY_STATE_OPEN,
} from './access-control.js';
import { serverConfig } from './config/env/server.js';
import { logger } from './logger.js';

// --- Configuration ---
const PING_TIMEOUT_MS = 30000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REDEMPTION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLAN_APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours of inactivity
const port = serverConfig.PORT;

// --- Storage Maps ---

/**
 * Map from topic-name to set of subscribed clients.
 */
const topics = new Map<string, Set<WebSocket>>();

/**
 * Plan approval state storage (planId -> approval state).
 */
const planApprovals = new Map<string, PlanApprovalState>();

/**
 * Invite tokens storage ("planId:tokenId" -> token).
 */
const inviteTokens = new Map<string, InviteToken>();

/**
 * Invite redemptions ("planId:tokenId:userId" -> redemption).
 */
const redemptions = new Map<string, InviteRedemption>();

/**
 * Connection user IDs (conn -> userId).
 * Uses WeakMap to allow garbage collection when connection closes.
 */
const connectionUserIds = new WeakMap<WebSocket, string>();

/**
 * Connection debug IDs for tracking.
 * Helps identify if messages are coming from different WebSocket instances.
 */
const connectionDebugIds = new WeakMap<WebSocket, number>();
let connectionIdCounter = 0;

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ noServer: true });

const server = http.createServer((_request: IncomingMessage, response: ServerResponse) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('okay');
});

// --- Utility Functions ---

/**
 * Generate a cryptographically secure invite token.
 * Uses Node.js crypto module for server-side generation.
 *
 * @returns Object containing tokenId, tokenValue, and tokenHash
 */
function generateInviteToken(): { tokenId: string; tokenValue: string; tokenHash: string } {
  const tokenId = nanoid(8);
  const tokenValue = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(tokenValue).digest('hex');
  return { tokenId, tokenValue, tokenHash };
}

/**
 * Verify a token value against a stored hash.
 *
 * @param tokenValue - The raw token value to verify
 * @param storedHash - The stored SHA256 hash to compare against
 * @returns True if the token matches the hash
 */
function verifyTokenHash(tokenValue: string, storedHash: string): boolean {
  const computedHash = createHash('sha256').update(tokenValue).digest('hex');
  return computedHash === storedHash;
}

// extractPlanId imported from access-control.ts

/**
 * Check if a user is approved for a plan.
 * Wrapper around the access-control module function.
 */
function isUserApproved(planId: string, userId: string | undefined): boolean {
  return isUserApprovedBase(planApprovals, planId, userId);
}

/**
 * Check if a user is rejected for a plan.
 * Wrapper around the access-control module function.
 */
function isUserRejected(planId: string, userId: string | undefined): boolean {
  return isUserRejectedBase(planApprovals, planId, userId);
}

// send function imported from access-control.ts

/**
 * Helper function for exhaustive switch statements.
 * Ensures all cases are handled at compile time.
 *
 * @param x - The value that should never be reached
 */
function assertNever(x: never): never {
  throw new Error(`Unexpected message type: ${JSON.stringify(x)}`);
}

/**
 * Clean up expired tokens, old redemptions, and stale plan approvals.
 * Runs periodically to prevent unbounded memory growth.
 */
function cleanupExpiredData(): void {
  const now = Date.now();
  let tokensRemoved = 0;
  let redemptionsRemoved = 0;
  let approvalsRemoved = 0;

  // Clean up expired invite tokens
  for (const [key, token] of inviteTokens.entries()) {
    if (now > token.expiresAt) {
      inviteTokens.delete(key);
      tokensRemoved++;
    }
  }

  // Clean up old redemptions (24 hours old)
  for (const [key, redemption] of redemptions.entries()) {
    if (now - redemption.redeemedAt > REDEMPTION_MAX_AGE_MS) {
      redemptions.delete(key);
      redemptionsRemoved++;
    }
  }

  // Clean up stale plan approvals (24 hours of inactivity)
  for (const [planId, approval] of planApprovals.entries()) {
    if (now - approval.lastUpdated > PLAN_APPROVAL_MAX_AGE_MS) {
      planApprovals.delete(planId);
      approvalsRemoved++;
    }
  }

  if (tokensRemoved > 0 || redemptionsRemoved > 0 || approvalsRemoved > 0) {
    logger.info(
      {
        tokensRemoved,
        redemptionsRemoved,
        approvalsRemoved,
      },
      '[cleanup] Removed expired data'
    );
  }
}

// --- Message Handlers ---

/**
 * Handle approval_state message from owner.
 * Validates sender is the owner and merges approved users to handle race conditions.
 *
 * @param conn - The WebSocket connection
 * @param message - The approval state message
 */
function handleApprovalState(conn: WebSocket, message: ApprovalStateMessage): void {
  const connId = connectionDebugIds.get(conn);

  // IMPORTANT: Store userId from this connection if not already set
  // This handles the race condition where approval_state arrives before subscribe message
  let userId = connectionUserIds.get(conn);
  if (!userId && message.ownerId) {
    // Infer userId from ownerId in the message (owner is sending this)
    userId = message.ownerId;
    connectionUserIds.set(conn, userId);
    logger.info(
      { connId, userId },
      '[handleApprovalState] Inferred userId from ownerId'
    );
  }

  logger.info(
    {
      connId,
      planId: message.planId,
      ownerId: message.ownerId,
      userId,
      approvedCount: message.approvedUsers.length,
      rejectedCount: message.rejectedUsers.length,
    },
    '[handleApprovalState] Processing approval state'
  );

  if (!userId) {
    logger.warn(
      { connId },
      '[handleApprovalState] No userId even after inference - rejecting'
    );
    return;
  }

  const existingApproval = planApprovals.get(message.planId);
  if (existingApproval && existingApproval.ownerId !== userId) {
    logger.warn(
      { userId, existingOwnerId: existingApproval.ownerId },
      'Rejected approval_state: sender is not owner'
    );
    return;
  }

  if (!existingApproval && message.ownerId !== userId) {
    logger.warn(
      { userId, claimedOwnerId: message.ownerId },
      'Rejected approval_state: sender claims to be different owner'
    );
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

  planApprovals.set(message.planId, approvalState);
  logger.info(
    {
      planId: message.planId,
      approvedCount: finalApprovedUsers.length,
      rejectedCount: message.rejectedUsers.length,
    },
    'Approval state updated'
  );
}

/**
 * Validate an invite token.
 * Returns error code or null if valid.
 *
 * @param token - The token to validate
 * @param tokenValue - The raw token value for hash verification
 * @returns Error code or null if valid
 */
function validateInviteToken(
  token: InviteToken | undefined,
  tokenValue: string
): TokenValidationError | null {
  if (!token) return 'invalid';
  if (token.revoked) return 'revoked';
  if (Date.now() > token.expiresAt) return 'expired';
  if (token.maxUses !== null && token.useCount >= token.maxUses) return 'exhausted';

  const isValid = verifyTokenHash(tokenValue, token.tokenHash);
  if (!isValid) return 'invalid';

  return null;
}

/**
 * Auto-approve a user after invite redemption.
 * Creates approval state if it doesn't exist (handles race condition).
 *
 * @param planId - The plan ID
 * @param userId - The user ID to approve
 * @param token - The invite token used
 */
function autoApproveUserFromInvite(planId: string, userId: string, token: InviteToken): void {
  let approval = planApprovals.get(planId);

  // If no approval state yet, create one from token metadata
  // This handles the race condition where guest arrives before owner
  if (!approval) {
    approval = {
      planId,
      ownerId: token.createdBy,
      approvedUsers: [token.createdBy],
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

  planApprovals.set(planId, approval);
}

/**
 * Notify owner that invite was redeemed.
 * Sends notification to all owner's connected WebSockets.
 *
 * @param planId - The plan ID
 * @param token - The invite token that was redeemed
 * @param redeemedBy - User who redeemed the token
 */
function notifyOwnerOfRedemption(planId: string, token: InviteToken, redeemedBy: string): void {
  const approval = planApprovals.get(planId);
  if (!approval) return;

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
  const topic = `peer-plan-${planId}`;
  const subscribers = topics.get(topic);
  if (!subscribers) return;

  for (const ws of subscribers) {
    const wsUserId = connectionUserIds.get(ws);
    if (wsUserId === approval.ownerId) {
      send(ws, notification);
    }
  }
}

/**
 * Handle create_invite message from owner.
 * Creates a new time-limited invite token.
 *
 * @param conn - The WebSocket connection
 * @param message - The create invite request
 */
function handleCreateInvite(conn: WebSocket, message: CreateInviteRequest): void {
  const connId = connectionDebugIds.get(conn);
  const userId = connectionUserIds.get(conn);

  logger.info(
    {
      connId,
      planId: message.planId,
      userId,
      hasApproval: planApprovals.has(message.planId),
    },
    '[handleCreateInvite] Processing create invite request'
  );

  if (!userId) {
    logger.warn({ connId }, '[handleCreateInvite] No userId - unauthenticated');
    send(conn, { type: 'error', error: 'unauthenticated' });
    return;
  }

  const approval = planApprovals.get(message.planId);
  logger.info(
    {
      connId,
      hasApproval: !!approval,
      ownerId: approval?.ownerId,
      userId,
      matches: approval?.ownerId === userId,
    },
    '[handleCreateInvite] Approval check'
  );

  if (!approval || approval.ownerId !== userId) {
    logger.warn({ connId }, '[handleCreateInvite] Not owner or no approval state');
    send(conn, { type: 'error', error: 'not_owner' });
    return;
  }

  const { tokenId, tokenValue, tokenHash } = generateInviteToken();
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

  const storageKey = `${message.planId}:${tokenId}`;
  inviteTokens.set(storageKey, token);

  logger.info(
    {
      tokenId,
      planId: message.planId,
      ttlMinutes: message.ttlMinutes ?? 30,
    },
    'Created invite token'
  );

  const response: InviteCreatedResponse = {
    type: 'invite_created',
    tokenId,
    tokenValue,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    label: token.label,
  };
  send(conn, response);
}

/**
 * Handle redeem_invite message from guest.
 * Validates token and auto-approves the user if valid.
 *
 * @param conn - The WebSocket connection
 * @param message - The redeem invite request
 */
function handleRedeemInvite(conn: WebSocket, message: RedeemInviteRequest): void {
  const { planId, tokenId, tokenValue, userId } = message;
  const storageKey = `${planId}:${tokenId}`;

  const token = inviteTokens.get(storageKey);
  const error = validateInviteToken(token, tokenValue);

  if (error) {
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: false,
      error,
    };
    send(conn, response);
    return;
  }

  const redemptionKey = `${planId}:${tokenId}:${userId}`;
  const existingRedemption = redemptions.get(redemptionKey);

  if (existingRedemption) {
    // Already redeemed by this user - return success (idempotent)
    const response: InviteRedemptionResult = {
      type: 'invite_redemption_result',
      success: true,
      planId,
    };
    send(conn, response);
    return;
  }

  // Type assertion is safe here because validateInviteToken returned null
  const validToken = token as InviteToken;

  // Increment use count
  validToken.useCount++;
  inviteTokens.set(storageKey, validToken);

  // Record redemption
  const redemption: InviteRedemption = {
    redeemedBy: userId,
    redeemedAt: Date.now(),
    tokenId,
  };
  redemptions.set(redemptionKey, redemption);

  // Auto-approve user
  autoApproveUserFromInvite(planId, userId, validToken);

  logger.info(
    { userId, tokenId, planId },
    'User redeemed invite token'
  );

  // Send success to guest
  const response: InviteRedemptionResult = {
    type: 'invite_redemption_result',
    success: true,
    planId,
  };
  send(conn, response);

  // Notify owner
  notifyOwnerOfRedemption(planId, validToken, userId);
}

/**
 * Handle revoke_invite message from owner.
 * Marks the invite as revoked (prevents future redemptions).
 *
 * @param conn - The WebSocket connection
 * @param message - The revoke invite request
 */
function handleRevokeInvite(conn: WebSocket, message: RevokeInviteRequest): void {
  const userId = connectionUserIds.get(conn);
  if (!userId) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    send(conn, response);
    return;
  }

  const approval = planApprovals.get(message.planId);
  if (!approval || approval.ownerId !== userId) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    send(conn, response);
    return;
  }

  const storageKey = `${message.planId}:${message.tokenId}`;
  const token = inviteTokens.get(storageKey);

  if (!token) {
    const response: InviteRevokedResponse = {
      type: 'invite_revoked',
      tokenId: message.tokenId,
      success: false,
    };
    send(conn, response);
    return;
  }

  token.revoked = true;
  inviteTokens.set(storageKey, token);

  logger.info(
    { tokenId: message.tokenId, planId: message.planId },
    'Revoked invite token'
  );

  const response: InviteRevokedResponse = {
    type: 'invite_revoked',
    tokenId: message.tokenId,
    success: true,
  };
  send(conn, response);
}

/**
 * Handle list_invites message from owner.
 * Returns list of active (non-expired, non-revoked) invites.
 *
 * @param conn - The WebSocket connection
 * @param message - The list invites request
 */
function handleListInvites(conn: WebSocket, message: ListInvitesRequest): void {
  const userId = connectionUserIds.get(conn);
  if (!userId) {
    const response: InvitesListResponse = {
      type: 'invites_list',
      planId: message.planId,
      invites: [],
    };
    send(conn, response);
    return;
  }

  const approval = planApprovals.get(message.planId);
  if (!approval || approval.ownerId !== userId) {
    const response: InvitesListResponse = {
      type: 'invites_list',
      planId: message.planId,
      invites: [],
    };
    send(conn, response);
    return;
  }

  const now = Date.now();
  const invites: InvitesListResponse['invites'] = [];

  for (const [key, token] of inviteTokens.entries()) {
    if (!key.startsWith(`${message.planId}:`)) continue;
    if (token.revoked || token.expiresAt < now) continue;
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
  send(conn, response);
}

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics.
 *
 * @param conn - The WebSocket connection
 * @param message - The subscribe message
 * @param subscribedTopics - Set to track this connection's subscriptions
 */
function handleSubscribe(
  conn: WebSocket,
  message: SubscribeMessage,
  subscribedTopics: Set<string>
): void {
  const connId = connectionDebugIds.get(conn);

  // Store userId if provided (for approval checking)
  if (message.userId) {
    logger.info(
      { connId, userId: message.userId },
      '[handleSubscribe] Storing userId'
    );
    connectionUserIds.set(conn, message.userId);
  }

  for (const topicName of message.topics ?? []) {
    if (typeof topicName !== 'string') continue;

    // Add conn to topic
    const topic = map.setIfUndefined(topics, topicName, () => new Set<WebSocket>());
    topic.add(conn);

    // Add topic to conn's subscriptions
    subscribedTopics.add(topicName);
  }
}

/**
 * Handle unsubscribe message from client.
 * Unsubscribes the client from the specified topics.
 *
 * @param conn - The WebSocket connection
 * @param message - The unsubscribe message
 * @param subscribedTopics - Set to track this connection's subscriptions
 */
function handleUnsubscribe(
  conn: WebSocket,
  message: UnsubscribeMessage,
  subscribedTopics: Set<string>
): void {
  for (const topicName of message.topics ?? []) {
    const subs = topics.get(topicName);
    if (subs) {
      subs.delete(conn);
      if (subs.size === 0) {
        topics.delete(topicName);
      }
    }
    subscribedTopics.delete(topicName);
  }
}

/**
 * Handle publish message with approval enforcement.
 * Broadcasts to topic subscribers, filtering based on approval status.
 *
 * @param conn - The WebSocket connection
 * @param message - The publish message
 */
function handlePublish(conn: WebSocket, message: PublishMessage): void {
  if (!message.topic) return;

  const receivers = topics.get(message.topic);
  if (!receivers) return;

  const senderUserId = connectionUserIds.get(conn);
  const planId = extractPlanId(message.topic);

  // If this is a plan document topic, enforce approval
  if (planId) {
    // Block rejected senders completely
    if (isUserRejected(planId, senderUserId)) {
      return;
    }

    const senderApproved = isUserApproved(planId, senderUserId);

    // Add client count to message (y-webrtc uses this)
    const outMessage: PublishMessage = {
      ...message,
      clients: receivers.size,
    };

    // Broadcast to filtered subscribers based on approval
    for (const receiver of receivers) {
      if (receiver === conn) continue; // Don't send back to sender

      const receiverUserId = connectionUserIds.get(receiver);

      // Block rejected recipients
      if (isUserRejected(planId, receiverUserId)) {
        continue;
      }

      const receiverApproved = isUserApproved(planId, receiverUserId);

      // Relay logic:
      // - If sender is approved, only send to other approved users
      // - If sender is pending, only send to other pending users (awareness sync)
      // This prevents approved content from leaking to pending users
      if (senderApproved === receiverApproved) {
        send(receiver, outMessage);
      }
    }
  } else {
    // Non-plan topics (e.g., plan-index) - broadcast to all
    const outMessage: PublishMessage = {
      ...message,
      clients: receivers.size,
    };
    for (const receiver of receivers) {
      send(receiver, outMessage);
    }
  }
}

/**
 * Handle a new WebSocket connection.
 * Sets up message handling, ping/pong keepalive, and cleanup on close.
 *
 * @param conn - The WebSocket connection
 */
function onConnection(conn: WebSocket): void {
  // Assign debug ID to track this connection
  const connId = ++connectionIdCounter;
  connectionDebugIds.set(conn, connId);
  logger.info({ connId }, '[onConnection] New connection');

  const subscribedTopics = new Set<string>();
  let closed = false;
  let pongReceived = true;

  // Ping/pong keepalive
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      conn.close();
      clearInterval(pingInterval);
    } else {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        conn.close();
      }
    }
  }, PING_TIMEOUT_MS);

  conn.on('pong', () => {
    pongReceived = true;
  });

  conn.on('close', () => {
    // Clean up topic subscriptions
    for (const topicName of subscribedTopics) {
      const subs = topics.get(topicName);
      if (subs) {
        subs.delete(conn);
        if (subs.size === 0) {
          topics.delete(topicName);
        }
      }
    }
    subscribedTopics.clear();
    closed = true;
    clearInterval(pingInterval);
  });

  conn.on('message', (rawMessage: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const messageStr =
        rawMessage instanceof Buffer
          ? rawMessage.toString()
          : Array.isArray(rawMessage)
            ? Buffer.concat(rawMessage).toString()
            : new TextDecoder().decode(rawMessage);

      const message = JSON.parse(messageStr) as SignalingMessage;

      if (!message || !message.type || closed) return;

      // Handle each message type with exhaustive switch
      switch (message.type) {
        case 'subscribe':
          handleSubscribe(conn, message, subscribedTopics);
          break;

        case 'unsubscribe':
          handleUnsubscribe(conn, message, subscribedTopics);
          break;

        case 'publish':
          handlePublish(conn, message);
          break;

        case 'ping':
          send(conn, { type: 'pong' });
          break;

        case 'approval_state':
          handleApprovalState(conn, message);
          break;

        case 'create_invite':
          handleCreateInvite(conn, message);
          break;

        case 'redeem_invite':
          handleRedeemInvite(conn, message);
          break;

        case 'revoke_invite':
          handleRevokeInvite(conn, message);
          break;

        case 'list_invites':
          handleListInvites(conn, message);
          break;

        default:
          // Exhaustive check - will fail at compile time if a case is missing
          assertNever(message);
      }
    } catch (error) {
      logger.error({ error }, 'Error handling message');
    }
  });
}

// --- Server Setup ---

wss.on('connection', onConnection);

server.on('upgrade', (request: IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
  wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port);

logger.info({ port }, 'Signaling server running');

// --- Periodic Cleanup ---

// Start cleanup interval to prevent memory leaks
const cleanupInterval = setInterval(cleanupExpiredData, CLEANUP_INTERVAL_MS);

// Ensure cleanup interval is cleared on process termination
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
  server.close();
});

process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
  server.close();
  process.exit(0);
});
