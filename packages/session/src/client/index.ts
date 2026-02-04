/**
 * @shipyard/session/client - Type-safe client for the Shipyard session server.
 *
 * @example
 * ```ts
 * import { SessionClient, createSessionClient } from '@shipyard/session/client';
 *
 * const client = createSessionClient('https://session.shipyard.dev');
 * const health = await client.health();
 * ```
 *
 * @module
 */

export type { SignalingClientOptions } from '../client';
export {
  AuthenticatedSignalingClient,
  createSignalingClient,
  ROUTE_DESCRIPTIONS,
  ROUTES,
  SignalingClient,
  SignalingClientError,
  SignalingClientValidationError,
} from '../client';
