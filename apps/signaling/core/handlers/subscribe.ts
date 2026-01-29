/**
 * Subscribe handler for signaling server.
 *
 * Two-message authentication pattern:
 * 1. subscribe: Adds subscription as PENDING (no data access yet)
 * 2. authenticate: Validates credentials, activates subscription
 *
 * SECURITY: Subscribe alone grants NO access. All data is blocked until
 * authenticate message is received and validated.
 */

export { handleSubscribe, handleUnsubscribe };

import type { PlatformAdapter } from '../platform.js';
import type { SubscribeMessage, UnsubscribeMessage } from '../types.js';

/** Auth deadline: 10 seconds to send authenticate message after subscribe */
const AUTH_DEADLINE_MS = 10000;

/**
 * Handle subscribe message from client (y-webrtc sends this automatically).
 *
 * SECURITY: This ONLY adds topics to PENDING state. No data flows until
 * the authenticate message is received and validated. This prevents
 * unauthorized access to plan data.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics
 */
function handleSubscribe(platform: PlatformAdapter, ws: unknown, message: SubscribeMessage): void {
  /** Add each topic to pending subscriptions (no data access granted) */
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.addPendingSubscription(ws, topic);
    platform.debug(`[Subscribe] Client pending subscription to topic: ${topic} (awaiting auth)`);
  }

  /** Set auth deadline - connection will be closed if auth not received in time */
  const deadline = Date.now() + AUTH_DEADLINE_MS;
  platform.setAuthDeadline(ws, deadline);
  platform.debug(`[Subscribe] Auth deadline set: ${AUTH_DEADLINE_MS}ms`);
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
