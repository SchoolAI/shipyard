import { z } from 'zod';

function getDefaultPort(): string {
  return import.meta.env.VITE_WS_PORT || '4445';
}

function getDefaultHttpUrl(): string {
  const port = getDefaultPort();
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isSecure ? 'https:' : 'http:';
  const host = import.meta.env.DEV ? 'localhost' : window.location.hostname;
  return `${protocol}//${host}:${port}`;
}

const schema = z.object({
  DAEMON_HTTP_URL: z.string().url(),
  DAEMON_HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(10000),
  DAEMON_HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().default(3000),
});

export const daemonConfig = schema.parse({
  DAEMON_HTTP_URL: import.meta.env.VITE_DAEMON_HTTP_URL || getDefaultHttpUrl(),
  DAEMON_HEALTH_CHECK_INTERVAL_MS: import.meta.env.VITE_DAEMON_HEALTH_CHECK_INTERVAL_MS,
  DAEMON_HEALTH_CHECK_TIMEOUT_MS: import.meta.env.VITE_DAEMON_HEALTH_CHECK_TIMEOUT_MS,
});

export type DaemonConfig = z.infer<typeof schema>;
