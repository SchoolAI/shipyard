/**
 * Subscribe handler for signaling server.
 *
 * Handles client subscription to room topics (plan IDs).
 * Validates epoch before allowing subscription.
 */

export { handleSubscribe, handleUnsubscribe };

import { DEFAULT_EPOCH, getEpochFromMetadata, isEpochValid } from '@shipyard/schema';
import type { PlatformAdapter } from '../platform.js';
import type { SubscribeMessage, UnsubscribeMessage } from '../types.js';

/**
 * Handle subscribe message from client.
 * Subscribes the client to the specified topics after validating epoch.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection (platform-specific type)
 * @param message - Subscribe message with topics and epoch
 * @param minimumEpoch - Minimum allowed epoch for this server
 */
function handleSubscribe(
  platform: PlatformAdapter,
  ws: unknown,
  message: SubscribeMessage,
  minimumEpoch: number
): void {
  const clientEpoch = message.epoch ?? DEFAULT_EPOCH;

  if (!isEpochValid(clientEpoch, minimumEpoch)) {
    platform.warn(
      `[Subscribe] Rejecting client: epoch ${clientEpoch} < minimum ${minimumEpoch}`
    );
    platform.sendMessage(ws, {
      type: 'error',
      error: 'epoch_too_old',
      message: `Client epoch (${clientEpoch}) is below server minimum (${minimumEpoch})`,
    });
    return;
  }

  for (const topic of message.topics ?? []) {
    if (typeof topic !== 'string') continue;
    platform.subscribeToTopic(ws, topic);
    const subscriberCount = platform.getTopicSubscribers(topic).length;
    platform.debug(
      `[Subscribe] Client subscribed to topic: ${topic} (now ${subscriberCount} subscribers)`
    );
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
