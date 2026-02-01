/**
 * @shipyard/signaling - Shared types and client for the Shipyard signaling server.
 *
 * This package provides:
 * - Zod schemas for all HTTP endpoints and WebSocket messages
 * - Route constants for server and client
 * - Type-safe client for interacting with the signaling server
 *
 * @example
 * ```ts
 * // Import schemas and types
 * import { HealthResponseSchema, type HealthResponse, ROUTES } from '@shipyard/signaling';
 *
 * // Import client separately
 * import { SignalingClient } from '@shipyard/signaling/client';
 * ```
 *
 * @module
 */

export * from "./routes";
export * from "./schemas";
