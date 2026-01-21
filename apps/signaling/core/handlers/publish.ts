/**
 * Publish handler for signaling server.
 *
 * Handles broadcasting messages to topic subscribers.
 * Simple relay - no authentication or approval filtering.
 */

export { handlePublish };

import type { PlatformAdapter } from '../platform.js';
import type { PublishMessage } from '../types.js';

/**
 * Handle publish message - relay to all topic subscribers.
 *
 * @param platform - Platform adapter for storage/messaging
 * @param ws - WebSocket connection of the sender
 * @param message - Publish message to broadcast
 */
function handlePublish(platform: PlatformAdapter, ws: unknown, message: PublishMessage): void {
  if (!message.topic) return;

  const subscribers = platform.getTopicSubscribers(message.topic);
  if (subscribers.length === 0) return;

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
