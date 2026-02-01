/**
 * Type definitions for y-webrtc internal APIs.
 *
 * NOTE: y-webrtc doesn't export these types. We define them based on runtime
 * structure for features like signaling connections and peer ID access.
 * The eslint-disable comments are intentional for library boundary crossings.
 *
 * This module does NOT depend on y-webrtc directly to avoid bundling WebRTC
 * polyfills in environments that don't need them. Functions accept `unknown`
 * and perform runtime type guards.
 *
 * @see Issue #80 - Type assertion cleanup
 * @see https://github.com/yjs/y-webrtc (source reference)
 */

/*
 * =============================================================================
 * Internal Type Definitions
 * =============================================================================
 */

/**
 * Signaling connection internal structure from y-webrtc.
 */
export interface SignalingConnection {
	ws: WebSocket | null;
	connected?: boolean;
	on?(event: "connect", handler: () => void): void;
	off?(event: "connect", handler: () => void): void;
}

/**
 * WebRTC peer connection wrapper from y-webrtc.
 */
export interface WebrtcConn<TPeer = unknown> {
	peer: TPeer;
}

/**
 * WebRTC room internal structure from y-webrtc.
 */
export interface WebrtcRoom<TPeer = unknown> {
	peerId?: string;
	webrtcConns?: Map<string, WebrtcConn<TPeer>>;
}

/**
 * Internal properties of WebrtcProvider that aren't in the public API.
 */
export interface WebrtcProviderInternals<TPeer = unknown> {
	signalingConns?: SignalingConnection[];
	room?: WebrtcRoom<TPeer> | null;
}

/*
 * =============================================================================
 * Type Guards & Accessors
 * =============================================================================
 */

/**
 * Check if an object has signaling connections array.
 * Runtime check before accessing internal y-webrtc properties.
 */
function hasSignalingConns(obj: unknown): obj is { signalingConns: unknown[] } {
	if (obj === null || typeof obj !== "object") return false;
	if (!("signalingConns" in obj)) return false;
	const record = Object.fromEntries(Object.entries(obj));
	return Array.isArray(record.signalingConns);
}

/**
 * Safely access signaling connections from a WebrtcProvider.
 * Returns empty array if not available.
 *
 * NOTE: This accesses undocumented y-webrtc internals. The cast is unavoidable
 * because the library doesn't export these types.
 *
 * @param provider - A WebrtcProvider instance (typed as unknown to avoid y-webrtc dependency)
 */
export function getSignalingConnections(
	provider: unknown,
): SignalingConnection[] {
	if (hasSignalingConns(provider)) {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
		return provider.signalingConns as SignalingConnection[];
	}
	return [];
}

/**
 * Safely get the WebRTC peer ID from a provider.
 * Returns undefined if not available.
 *
 * @param provider - A WebrtcProvider instance (typed as unknown to avoid y-webrtc dependency)
 */
export function getWebrtcPeerId(provider: unknown): string | undefined {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
	const internal = provider as WebrtcProviderInternals | null | undefined;
	return internal?.room?.peerId;
}

/**
 * Safely get the WebRTC room from a provider.
 * Returns null if not available.
 *
 * @param provider - A WebrtcProvider instance (typed as unknown to avoid y-webrtc dependency)
 */
export function getWebrtcRoom<TPeer = unknown>(
	provider: unknown,
): WebrtcRoom<TPeer> | null {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
	const internal = provider as
		| WebrtcProviderInternals<TPeer>
		| null
		| undefined;
	return internal?.room ?? null;
}
