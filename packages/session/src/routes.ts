/**
 * Shared route constants for the signaling server.
 *
 * Used by both server (route registration) and client (request URLs).
 * Single source of truth prevents drift between implementations.
 *
 * @module client/routes
 */
export const ROUTES = {
  HEALTH: '/health',
  AUTH_GITHUB_CALLBACK: '/auth/github/callback',
  COLLAB_CREATE: '/collab/create',
  WS_PERSONAL: '/personal/:userId',
  WS_COLLAB: '/collab/:roomId',
} as const;

/**
 * Human-readable endpoint descriptions for documentation and error messages.
 */
export const ROUTE_DESCRIPTIONS = [
  `GET ${ROUTES.HEALTH}`,
  `POST ${ROUTES.AUTH_GITHUB_CALLBACK}`,
  `POST ${ROUTES.COLLAB_CREATE}`,
  `WS ${ROUTES.WS_PERSONAL}`,
  `WS ${ROUTES.WS_COLLAB}`,
] as const;
