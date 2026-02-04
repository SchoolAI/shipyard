/**
 * Zod schemas for all MCP server HTTP endpoint request/response bodies.
 *
 * This module provides:
 * - Validation schemas for all 3 HTTP endpoints
 * - Inferred TypeScript types for type-safe API usage
 * - Error response schemas for consistent error handling
 *
 * This is the single source of truth for all API schemas.
 * The client directory is designed to be self-contained and hoistable
 * to packages/server without depending on server code.
 *
 * @module client/schemas
 */

import { z } from 'zod';

/**
 * Standard error response schema used across all endpoints.
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Validation error response with field-level details.
 */
export const ValidationErrorResponseSchema = ErrorResponseSchema.extend({
  details: z
    .array(
      z.object({
        path: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
        code: z.string().optional(),
      })
    )
    .optional(),
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;

/**
 * Not found error response with available endpoints.
 */
export const NotFoundResponseSchema = ErrorResponseSchema.extend({
  endpoints: z.array(z.string()),
});

export type NotFoundResponse = z.infer<typeof NotFoundResponseSchema>;

/**
 * Path parameters for PR-related endpoints.
 */
export const PrPathParamsSchema = z.object({
  /** Plan ID for the task */
  id: z.string().min(1, 'Plan ID is required'),
  /** GitHub PR number */
  prNumber: z.string().regex(/^\d+$/, 'PR number must be a positive integer'),
});

export type PrPathParams = z.infer<typeof PrPathParamsSchema>;

/**
 * GET /health success response schema.
 *
 * Returns daemon health status and uptime for MCP startup validation.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  /** Uptime in milliseconds */
  uptime: z.number().nonnegative(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * GET /health error response schema.
 *
 * Returned when the server is not initialized or unhealthy.
 */
export const HealthErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
});

export type HealthErrorResponse = z.infer<typeof HealthErrorResponseSchema>;

/**
 * GET /api/plans/:id/pr-diff/:prNumber success response.
 *
 * Returns raw diff text for a GitHub PR.
 * Content-Type: text/plain
 */
export const PrDiffResponseSchema = z.string();

export type PrDiffResponse = z.infer<typeof PrDiffResponseSchema>;

/**
 * PR diff endpoint error response.
 */
export const PrDiffErrorResponseSchema = z.discriminatedUnion('error', [
  z.object({
    error: z.literal('not_found'),
    message: z.string(),
  }),
  z.object({
    error: z.literal('github_api_error'),
    message: z.string(),
  }),
  z.object({
    error: z.literal('not_implemented'),
    prNumber: z.string(),
  }),
]);

export type PrDiffErrorResponse = z.infer<typeof PrDiffErrorResponseSchema>;

/**
 * File change status in a PR.
 */
export const FileStatusSchema = z.enum(['added', 'modified', 'deleted', 'renamed']);

export type FileStatus = z.infer<typeof FileStatusSchema>;

/**
 * Single file change in a PR.
 */
export const PrFileSchema = z.object({
  /** File path relative to repo root */
  path: z.string(),
  /** Number of lines added */
  additions: z.number().nonnegative(),
  /** Number of lines deleted */
  deletions: z.number().nonnegative(),
  /** Change status */
  status: FileStatusSchema,
});

export type PrFile = z.infer<typeof PrFileSchema>;

/**
 * GET /api/plans/:id/pr-files/:prNumber success response.
 *
 * Returns array of changed files in a GitHub PR.
 */
export const PrFilesResponseSchema = z.array(PrFileSchema);

export type PrFilesResponse = z.infer<typeof PrFilesResponseSchema>;

/**
 * PR files endpoint error response.
 */
export const PrFilesErrorResponseSchema = z.discriminatedUnion('error', [
  z.object({
    error: z.literal('not_found'),
    message: z.string(),
  }),
  z.object({
    error: z.literal('github_api_error'),
    message: z.string(),
  }),
  z.object({
    error: z.literal('not_implemented'),
    prNumber: z.string(),
  }),
]);

export type PrFilesErrorResponse = z.infer<typeof PrFilesErrorResponseSchema>;
