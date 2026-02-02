/**
 * WebRTC data channel adapter for Loro sync.
 *
 * Thin wrapper around @loro-extended/adapter-webrtc.
 * Enables P2P sync between daemon and browser.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

import { WebRtcDataChannelAdapter } from "@loro-extended/adapter-webrtc";

export { WebRtcDataChannelAdapter };

/**
 * Create a WebRTC adapter for P2P Loro sync.
 * This adapter uses the "Bring Your Own Data Channel" approach.
 * Callers manage WebRTC connections (e.g., via simple-peer) and
 * attach data channels to this adapter for Loro sync.
 *
 * Note: RTCDataChannel is a browser-only type. On the server side,
 * use a library like wrtc to get compatible data channels.
 *
 * @example
 * ```typescript
 * const adapter = createWebRtcAdapter();
 * // When a WebRTC connection is established
 * peer.on('connect', () => {
 *   const dataChannel = peer._pc.createDataChannel('loro-sync', { ordered: true });
 *   adapter.attachDataChannel(remotePeerId, dataChannel);
 * });
 * // When connection closes
 * peer.on('close', () => {
 *   adapter.detachDataChannel(remotePeerId);
 * });
 * ```
 */
export function createWebRtcAdapter(): WebRtcDataChannelAdapter {
	return new WebRtcDataChannelAdapter();
}
