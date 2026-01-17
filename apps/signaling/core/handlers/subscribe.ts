/**
 * Subscribe handler for signaling server.
 *
 * Handles client subscription to room topics (plan IDs).
 * Tracks userId for approval checking across both platforms.
 */

export { handleSubscribe, handleUnsubscribe };

import type { PlatformAdapter } from '../platform.js';
import type { SubscribeMessage, UnsubscribeMessage } from '../types.js';

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics and stores userId if provided.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics and optional userId
 */
function handleSubscribe(platform: PlatformAdapter, ws: unknown, message: SubscribeMessage): void {
  // Store userId if provided (for approval checking)
  if (message.userId) {
    platform.setUserId(ws, message.userId);
    platform.debug('[handleSubscribe] Stored userId for connection', { userId: message.userId });
  }

  // Subscribe to each topic
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.subscribeToTopic(ws, topic);
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
