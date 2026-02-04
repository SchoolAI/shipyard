/**
 * Daemon configuration for web client.
 * Uses Zod for validation and provides defaults.
 */

import { z } from 'zod';

const schema = z.object({
  /**
   * WebSocket URL for daemon connection.
   * Defaults to localhost:56609 (primary daemon port).
   */
  DAEMON_WS_URL: z.string().url().default('ws://localhost:56609'),

  /**
   * Reconnect interval in milliseconds when daemon connection drops.
   */
  DAEMON_RECONNECT_INTERVAL_MS: z.coerce.number().default(5000),
});

export const daemonConfig = schema.parse({
  DAEMON_WS_URL: import.meta.env.VITE_DAEMON_WS_URL,
  DAEMON_RECONNECT_INTERVAL_MS: import.meta.env.VITE_DAEMON_RECONNECT_INTERVAL_MS,
});

export type DaemonConfig = z.infer<typeof schema>;
