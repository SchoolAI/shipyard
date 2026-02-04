/**
 * @shipyard/session - Shared types and client for the Shipyard session server.
 *
 * This package provides:
 * - Zod schemas for all HTTP endpoints and WebSocket messages
 * - Route constants for server and client
 * - Type-safe client for interacting with the session server
 *
 * @example
 * ```ts
 * // Import schemas and types
 * import { HealthResponseSchema, type HealthResponse, ROUTES } from '@shipyard/session';
 *
 * // Import client separately
 * import { SessionClient } from '@shipyard/session/client';
 * ```
 *
 * @module
 */

export * from './routes';
export * from './schemas';
