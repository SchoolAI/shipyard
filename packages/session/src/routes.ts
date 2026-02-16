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
  AUTH_DEVICE_START: '/auth/device/start',
  AUTH_DEVICE_VERIFY: '/auth/device/verify',
  AUTH_DEVICE_POLL: '/auth/device/poll',
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
  `POST ${ROUTES.AUTH_DEVICE_START}`,
  `GET ${ROUTES.AUTH_DEVICE_VERIFY}`,
  `POST ${ROUTES.AUTH_DEVICE_POLL}`,
  `POST ${ROUTES.COLLAB_CREATE}`,
  `WS ${ROUTES.WS_PERSONAL}`,
  `WS ${ROUTES.WS_COLLAB}`,
] as const;
