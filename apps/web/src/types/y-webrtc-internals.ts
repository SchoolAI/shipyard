/**
 * Type definitions for y-webrtc internal APIs.
 *
 * NOTE: These access undocumented internals of y-webrtc. The library doesn't
 * export these types, so we define them based on runtime structure.
 * This is unavoidable for features like peer ID access and signaling state.
 */
import type { WebrtcProvider } from 'y-webrtc';

export interface SignalingConnection {
  ws: WebSocket | null;
  connected?: boolean;
  on?(event: 'connect', handler: () => void): void;
  off?(event: 'connect', handler: () => void): void;
}

export interface WebrtcConn<TPeer = unknown> {
  peer: TPeer;
}

export interface WebrtcRoom<TPeer = unknown> {
  peerId?: string;
  webrtcConns?: Map<string, WebrtcConn<TPeer>>;
}

export interface WebrtcProviderInternals<TPeer = unknown> {
  signalingConns?: SignalingConnection[];
  room?: WebrtcRoom<TPeer> | null;
}

/**
 * Safely access signaling connections from a WebrtcProvider.
 * Returns empty array if not available.
 */
export function getSignalingConnections(provider: WebrtcProvider): SignalingConnection[] {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
  const internal = provider as unknown as WebrtcProviderInternals;
  return internal.signalingConns ?? [];
}

/**
 * Safely get the WebRTC peer ID from a provider.
 * Returns undefined if not available.
 */
export function getWebrtcPeerId(provider: WebrtcProvider): string | undefined {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
  const internal = provider as unknown as WebrtcProviderInternals;
  return internal.room?.peerId;
}

/**
 * Safely get the WebRTC room from a provider.
 * Returns null if not available.
 */
export function getWebrtcRoom<TPeer = unknown>(
  provider: WebrtcProvider
): WebrtcRoom<TPeer> | null {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- y-webrtc internal API not exported
  const internal = provider as unknown as WebrtcProviderInternals<TPeer>;
  return internal.room ?? null;
}
