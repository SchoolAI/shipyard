/**
 * Loro CRDT adapters setup.
 *
 * Exports configured adapters for storage, WebSocket, and WebRTC sync.
 * These are thin wrappers around @loro-extended adapter packages.
 */

export { createStorage } from "./adapters/storage.js";
export { createWebRtcAdapter } from "./adapters/webrtc.js";
export { createWebSocketAdapter } from "./adapters/websocket.js";
