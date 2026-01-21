/**
 * Publish handler for signaling server.
 *
 * Handles broadcasting messages to topic subscribers with approval-based filtering.
 * Enforces access control at the peer discovery layer - unapproved users cannot
 * discover or connect to approved peers, preventing CRDT data leakage.
 */

export { handlePublish };

import type { PlatformAdapter } from '../platform.js';
import type { PlanApprovalState, PublishMessage } from '../types.js';

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
  // Prevents race conditions where pending users connect before owner pushes state
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
 * Check if a user is rejected for a plan.
 * Plan owner can never be rejected.
 */
function isUserRejected(
  approval: PlanApprovalState | undefined,
  userId: string | undefined
): boolean {
  if (!approval || !userId) return false;

  // Owner can never be rejected
  if (userId === approval.ownerId) return false;

  return approval.rejectedUsers.includes(userId);
}

/**
 * Handle publish message with approval enforcement.
 * Broadcasts to topic subscribers, filtering based on approval status.
 *
 * Access control rules:
 * - Rejected users cannot send or receive messages
 * - Pending users can only communicate with other pending users (awareness sync)
 * - Approved users can communicate with all approved users and the owner
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the sender
 * @param message - Publish message to broadcast
 */
async function handlePublish(
  platform: PlatformAdapter,
  ws: unknown,
  message: PublishMessage
): Promise<void> {
  if (!message.topic) return;

  const subscribers = platform.getTopicSubscribers(message.topic);
  if (subscribers.length === 0) return;

  const senderUserId = platform.getUserId(ws);
  const planId = extractPlanId(message.topic);

  // For plan document topics, enforce approval-based filtering
  if (planId) {
    const approval = await platform.getApprovalState(planId);

    // If no approval state exists, allow P2P sync (open collaboration)
    // This fixes the case where owner's browser hasn't pushed approval state yet
    if (!approval) {
      const outMessage: PublishMessage = {
        ...message,
        clients: subscribers.length,
      };
      for (const subscriber of subscribers) {
        if (subscriber === ws) continue;
        if (platform.isFlushingMessages(subscriber)) continue;
        platform.sendMessage(subscriber, outMessage);
      }
      return;
    }

    // Block rejected senders completely
    if (isUserRejected(approval, senderUserId)) {
      return;
    }

    const senderApproved = isUserApproved(approval, senderUserId);

    // Add client count to message (y-webrtc uses this)
    const outMessage: PublishMessage = {
      ...message,
      clients: subscribers.length,
    };

    // Broadcast to filtered subscribers based on approval
    for (const subscriber of subscribers) {
      // Don't send back to sender
      if (subscriber === ws) continue;

      // Skip subscribers currently flushing their queue to prevent race conditions
      // Messages sent during flush could be duplicated (sent directly + from queue)
      if (platform.isFlushingMessages(subscriber)) {
        continue;
      }

      const subscriberUserId = platform.getUserId(subscriber);

      // Block rejected recipients
      if (isUserRejected(approval, subscriberUserId)) {
        continue;
      }

      // Handle unidentified subscribers (no userId yet)
      // Queue messages for later delivery when they identify themselves
      // This fixes the race condition where y-webrtc subscribes before userId is sent
      if (!subscriberUserId) {
        platform.queueMessageForConnection(subscriber, message.topic, outMessage);
        continue;
      }

      const subscriberApproved = isUserApproved(approval, subscriberUserId);

      // Relay logic:
      // - If sender is approved, only send to other approved users
      // - If sender is pending, only send to other pending users (awareness sync)
      // This prevents approved content from leaking to pending users
      if (senderApproved === subscriberApproved) {
        platform.sendMessage(subscriber, outMessage);
      }
    }
  } else {
    // Non-plan topics (e.g., plan-index) - broadcast to all without filtering
    const outMessage: PublishMessage = {
      ...message,
      clients: subscribers.length,
    };

    // Non-plan topics broadcast to ALL subscribers (including sender)
    // This matches the original y-webrtc protocol behavior
    for (const subscriber of subscribers) {
      platform.sendMessage(subscriber, outMessage);
    }
  }
}
