/**
 * Shipyard Signaling Worker
 *
 * Handles:
 * - GitHub OAuth → Shipyard JWT issuance
 * - Personal Room WebSocket connections (agent registry)
 * - Collab Room WebSocket connections (shared sessions)
 * - WebRTC signaling relay
 */

import { app } from "./routes";

export { CollabRoom } from "./durable-objects/collab-room";
// Re-export Durable Objects for Cloudflare
export { PersonalRoom } from "./durable-objects/personal-room";

// Export Hono app as default
export default app;
