/**
 * Subscribe handler for signaling server.
 *
 * Handles client subscription to room topics (plan IDs).
 * Tracks userId for approval checking across both platforms.
 * Flushes queued messages when userId is set (fixes race condition).
 */

export { handleSubscribe, handleUnsubscribe };

import type { PlatformAdapter } from '../platform.js';
import type { PlanApprovalState, SubscribeMessage, UnsubscribeMessage } from '../types.js';

/**
 * Topic prefix for plan documents.
 * Topics follow format: "shipyard-{planId}"
 */
const PLAN_TOPIC_PREFIX = 'shipyard-';

/**
 * Extract plan ID from topic name.
 * Returns null if not a plan topic.
 */
function extractPlanId(topic: string): string | null {
  if (topic.startsWith(PLAN_TOPIC_PREFIX)) {
    return topic.slice(PLAN_TOPIC_PREFIX.length);
  }
  return null;
}

/**
 * Check if a user is approved for a plan.
 * Returns true if user is owner or in approved list (and not rejected).
 * Returns false if no approval state exists (deny by default until owner pushes state).
 */
function isUserApproved(
  approval: PlanApprovalState | undefined,
  userId: string | undefined
): boolean {
  // No approval state - deny by default
  if (!approval) return false;

  // No userId - deny (must authenticate to access plans)
  if (!userId) return false;

  // Owner is always approved
  if (userId === approval.ownerId) return true;

  // Check rejected first (takes precedence)
  if (approval.rejectedUsers.includes(userId)) return false;

  // Check if in approved list
  return approval.approvedUsers.includes(userId);
}

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics and stores userId if provided.
 * When userId is set, flushes any queued messages after checking approval status.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics and optional userId
 */
async function handleSubscribe(
  platform: PlatformAdapter,
  ws: unknown,
  message: SubscribeMessage
): Promise<void> {
  // Store userId if provided (for approval checking)
  if (message.userId) {
    platform.setUserId(ws, message.userId);
    platform.debug('[handleSubscribe] Stored userId for connection', { userId: message.userId });

    // Flush queued messages now that we know who this user is
    // Messages were queued in publish.ts when userId wasn't set yet
    await flushQueuedMessages(platform, ws, message.userId);
  }

  // Subscribe to each topic
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.subscribeToTopic(ws, topic);
  }
}

/**
 * Flush queued messages for a connection now that we know the userId.
 * Only delivers messages for topics where the user is approved.
 * Discards messages for topics where the user is rejected or pending.
 *
 * This fixes the race condition where y-webrtc subscribes before userId is sent,
 * causing messages from approved users (like the plan owner) to be blocked.
 *
 * Sets a flushing flag to prevent concurrent publish operations from sending
 * messages to this connection during the flush (prevents duplicates).
 */
async function flushQueuedMessages(
  platform: PlatformAdapter,
  ws: unknown,
  userId: string
): Promise<void> {
  // Mark connection as flushing to prevent race conditions with handlePublish
  platform.setFlushingMessages(ws, true);

  try {
    const queuedByTopic = platform.getAndClearQueuedMessages(ws);

    if (queuedByTopic.size === 0) return;

    platform.debug('[handleSubscribe] Flushing queued messages', {
      userId,
      topicCount: queuedByTopic.size,
    });

  for (const [topic, messages] of queuedByTopic) {
    const planId = extractPlanId(topic);

    // Non-plan topics: deliver all queued messages
    if (!planId) {
      for (const msg of messages) {
        platform.sendMessage(ws, msg);
      }
      continue;
    }

    // Plan topics: check approval before delivering
    const approval = await platform.getApprovalState(planId);
    const approved = isUserApproved(approval, userId);

    if (approved) {
      // User is approved - deliver all queued messages for this topic
      platform.debug('[handleSubscribe] Delivering queued messages for approved user', {
        userId,
        planId,
        messageCount: messages.length,
      });
      for (const msg of messages) {
        platform.sendMessage(ws, msg);
      }
    } else {
      // User is pending (e.g., has invite but hasn't redeemed yet)
      // Re-queue messages instead of discarding - they may be approved soon
      // This fixes invite flow where approval happens milliseconds after identify
      platform.debug('[handleSubscribe] Re-queueing messages for pending user', {
        userId,
        planId,
        messageCount: messages.length,
      });
      for (const msg of messages) {
        platform.queueMessageForConnection(ws, topic, msg);
      }
    }
  }
  } finally {
    // Always clear flushing flag, even if flush fails
    platform.setFlushingMessages(ws, false);
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
