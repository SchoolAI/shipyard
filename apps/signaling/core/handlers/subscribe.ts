/**
 * Subscribe handler for signaling server.
 *
 * Handles client subscription to room topics (plan IDs).
 * Simple pub/sub - no authentication or approval checking.
 */

export { handleSubscribe, handleUnsubscribe };

import type { PlatformAdapter } from '../platform.js';
import type { SubscribeMessage, UnsubscribeMessage } from '../types.js';

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics
 */
function handleSubscribe(platform: PlatformAdapter, ws: unknown, message: SubscribeMessage): void {
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
