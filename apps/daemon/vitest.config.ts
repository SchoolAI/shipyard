import { defineConfig } from 'vitest/config';

/**
 * Set unique test port before any imports to avoid conflicts with running daemon.
 * This must happen at config load time, before any test files import config.ts.
 */
if (!process.env.DAEMON_PORT) {
  process.env.DAEMON_PORT = '56801';
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    /**
     * Run test files sequentially to avoid WebSocket server port conflicts.
     * The WebSocket server is a singleton that binds to specific ports,
     * and parallel test files would compete for these ports.
     */
    fileParallelism: false,
  },
});
