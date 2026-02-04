/**
 * MCP Server Client - Shared types and constants for the Shipyard MCP server HTTP API.
 *
 * This module provides:
 * - Zod schemas for all 3 HTTP endpoints
 * - Route constants for server and client
 * - Type-safe request/response types
 *
 * This directory is designed to be self-contained and hoistable to packages/server
 * without depending on server implementation code.
 *
 * @example
 * ```ts
 * import {
 *   ROUTES,
 *   buildPrDiffUrl,
 *   HealthResponseSchema,
 *   type HealthResponse,
 *   type PrFilesResponse,
 * } from '../client/index.js';
 *
 * // Build URL for PR diff
 * const url = buildPrDiffUrl('plan-123', 42);
 *
 * // Validate response
 * const health = HealthResponseSchema.parse(response);
 * ```
 *
 * @module client
 */

export * from './routes.js';
export * from './schemas.js';
