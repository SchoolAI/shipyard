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

import type { PlatformAdapter } from '../platform.js';
import type { AuthErrorResponse, SubscribeMessage, UnsubscribeMessage } from '../types.js';

export { handleSubscribe, handleUnsubscribe, checkAuthDeadlines };

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
  // Topics are added as PENDING only - no data access until authenticate succeeds
  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.addPendingSubscription(ws, topic);
    platform.debug(`[Subscribe] Client pending subscription to topic: ${topic} (awaiting auth)`);
  }

  // Auth deadline enforces timely authentication - connection closed if exceeded
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

/**
 * Check for expired auth deadlines and disconnect timed-out connections.
 *
 * This function should be called periodically (e.g., every 5 seconds) to
 * enforce the 10-second authentication deadline on pending subscriptions.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param closeConnection - Platform-specific function to close a WebSocket
 * @returns Number of connections disconnected due to timeout
 */
function checkAuthDeadlines(
  platform: PlatformAdapter,
  closeConnection: (ws: unknown) => void
): number {
  const now = Date.now();
  const connectionsWithDeadlines = platform.getAllConnectionsWithDeadlines();
  let disconnectedCount = 0;

  for (const { ws, deadline } of connectionsWithDeadlines) {
    if (deadline <= now) {
      const errorMessage: AuthErrorResponse = {
        type: 'auth_error',
        error: 'timeout',
        message: 'Authentication timeout: authenticate message not received within 10 seconds',
      };
      platform.sendMessage(ws, errorMessage);
      platform.unsubscribeFromAllTopics(ws);
      platform.clearAuthDeadline(ws);
      closeConnection(ws);
      disconnectedCount++;
      platform.debug(`[Auth Timeout] Connection closed due to auth deadline expiration`);
    }
  }

  return disconnectedCount;
}
