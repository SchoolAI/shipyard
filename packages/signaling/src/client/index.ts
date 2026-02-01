/**
 * @shipyard/signaling/client - Type-safe client for the Shipyard signaling server.
 *
 * @example
 * ```ts
 * import { SignalingClient, createSignalingClient } from '@shipyard/signaling/client';
 *
 * const client = createSignalingClient('https://signaling.shipyard.dev');
 * const health = await client.health();
 * ```
 *
 * @module
 */

export type { SignalingClientOptions } from "../client";
export {
	AuthenticatedSignalingClient,
	createSignalingClient,
	ROUTE_DESCRIPTIONS,
	ROUTES,
	SignalingClient,
	SignalingClientError,
	SignalingClientValidationError,
} from "../client";
