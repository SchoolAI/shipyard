/**
 * Loro CRDT adapters setup.
 *
 * Exports configured adapters for storage, WebSocket, and WebRTC sync.
 * These are thin wrappers around @loro-extended adapter packages.
 */

export { createStorage } from "./storage.js";
export { createWebRtcAdapter } from "./webrtc.js";
export { createWebSocketAdapter } from "./websocket.js";
