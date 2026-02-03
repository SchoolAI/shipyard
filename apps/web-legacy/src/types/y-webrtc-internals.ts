/**
 * Re-export y-webrtc internals from shared schema package.
 *
 * NOTE: These types access undocumented y-webrtc internals. The library doesn't
 * export these types, so we define them based on runtime structure.
 * See packages/schema/src/y-webrtc-internals.ts for implementation.
 *
 * @see Issue #80 - Type assertion cleanup
 */
export {
	getSignalingConnections,
	getWebrtcPeerId,
	getWebrtcRoom,
	type SignalingConnection,
	type WebrtcConn,
	type WebrtcProviderInternals,
	type WebrtcRoom,
} from "@shipyard/schema";
