import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    retry: 0,
    exclude: ['node_modules', 'dist'],
  },
});
