import { defineConfig } from 'vitest/config';

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
