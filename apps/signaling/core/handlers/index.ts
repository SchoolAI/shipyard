/**
 * Core message handlers for signaling server.
 *
 * These handlers are platform-agnostic and work with both:
 * - Node.js WebSocket server (apps/signaling/src/server.ts)
 * - Cloudflare Durable Objects (apps/signaling/cloudflare/src/signaling.ts)
 *
 * Each handler takes a PlatformAdapter as its first argument, which abstracts
 * over platform-specific storage, crypto, and WebSocket operations.
 */

export { handleAuthenticate } from './authenticate.js';
export { handleValidateEpoch } from './epoch-validation.js';
export {
  handleCreateInvite,
  handleListInvites,
  handleRedeemInvite,
  handleRevokeInvite,
} from './invites.js';
export { handlePublish } from './publish.js';
export { handleSubscribe, handleUnsubscribe, checkAuthDeadlines } from './subscribe.js';
