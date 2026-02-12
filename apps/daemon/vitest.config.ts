import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    retry: 0,
    globals: true,
    exclude: ['node_modules', 'dist'],
  },
});
