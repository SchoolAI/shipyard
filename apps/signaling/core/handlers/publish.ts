/**
 * Publish handler for signaling server.
 *
 * Handles broadcasting messages to topic subscribers.
 *
 * Simple relay - all subscribed clients receive all messages.
 * Access control happens at subscription time (subscribe.ts validates tokens).
 */

export { handlePublish };

import type { PlatformAdapter } from '../platform.js';
import type { PublishMessage } from '../types.js';

/**
 * Handle publish message - relay to all topic subscribers.
 *
 * All subscribers of a topic receive the message (except the sender).
 * Access control is enforced at subscription time via token validation.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the sender
 * @param message - Publish message to broadcast
 */
function handlePublish(platform: PlatformAdapter, ws: unknown, message: PublishMessage): void {
  if (!message.topic) return;

  const subscribers = platform.getTopicSubscribers(message.topic);

  // Log publish attempt for debugging
  const recipientCount = subscribers.filter((s) => s !== ws).length;
  platform.debug(
    `[Publish] Topic: ${message.topic}, subscribers: ${subscribers.length}, will relay to: ${recipientCount}`
  );

  if (subscribers.length === 0) {
    platform.debug(`[Publish] No subscribers for topic: ${message.topic}`);
    return;
  }

  // Add client count to message (y-webrtc uses this)
  const outMessage: PublishMessage = {
    ...message,
    clients: subscribers.length,
  };

  // Broadcast to all subscribers except sender
  for (const subscriber of subscribers) {
    if (subscriber === ws) continue;
    platform.sendMessage(subscriber, outMessage);
  }
}
