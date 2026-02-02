/**
 * WebRTC data channel adapter for Loro sync.
 *
 * Thin wrapper around @loro-extended/adapter-webrtc.
 * Enables P2P sync between daemon and browser.
 * @see docs/whips/daemon-mcp-server-merge.md#4-use-loro-extended-adapters
 */

// TODO: Import from @loro-extended/adapter-webrtc
// import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc'

/**
 * WebRTC adapter interface (placeholder until loro-extended types available).
 */
export interface WebRtcAdapter {
	// TODO: Define based on loro-extended adapter interface
	attachToDataChannel(channel: unknown): void;
}

/**
 * Create a WebRTC adapter for P2P Loro sync.
 */
export function createWebRtcAdapter(): WebRtcAdapter {
	// TODO: Implement using WebRtcDataChannelAdapter
	// const adapter = new WebRtcDataChannelAdapter()
	// return adapter
	throw new Error("Not implemented");
}
