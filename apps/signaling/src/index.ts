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
export { PersonalRoom } from "./durable-objects/personal-room";

export default app;
