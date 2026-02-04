/**
 * Shared route constants for the MCP server HTTP endpoints.
 *
 * Used by both server (route registration) and client (request URLs).
 * Single source of truth prevents drift between implementations.
 *
 * @module client/routes
 */

export const ROUTES = {
  /** Health check endpoint for daemon validation */
  HEALTH: '/health',
  /** GitHub PR diff proxy (CORS workaround) */
  PR_DIFF: '/api/plans/:id/pr-diff/:prNumber',
  /** GitHub PR files proxy (CORS workaround) */
  PR_FILES: '/api/plans/:id/pr-files/:prNumber',
} as const;

/**
 * Human-readable endpoint descriptions for documentation and error messages.
 */
export const ROUTE_DESCRIPTIONS = [
  `GET ${ROUTES.HEALTH}`,
  `GET ${ROUTES.PR_DIFF}`,
  `GET ${ROUTES.PR_FILES}`,
] as const;

/**
 * Build PR diff URL with parameters substituted.
 */
export function buildPrDiffUrl(planId: string, prNumber: number): string {
  return ROUTES.PR_DIFF.replace(':id', planId).replace(':prNumber', String(prNumber));
}

/**
 * Build PR files URL with parameters substituted.
 */
export function buildPrFilesUrl(planId: string, prNumber: number): string {
  return ROUTES.PR_FILES.replace(':id', planId).replace(':prNumber', String(prNumber));
}
