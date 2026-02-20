import { defineConfig } from 'vitest/config';
import { DEFAULT_TIER_THRESHOLDS, generateCoverageThresholds } from '../../scripts/analyze-fan-in';

const fanInEnabled = !process.env.DISABLE_FANIN_COVERAGE;
const fanInThresholds = generateCoverageThresholds('./src', DEFAULT_TIER_THRESHOLDS, fanInEnabled);

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    retry: 0,
    globals: true,
    exclude: ['node_modules', 'dist'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/test-utils/**',
        'src/**/__tests__/**',
      ],
      thresholds: {
        functions: 30,
        ...fanInThresholds,
      },
    },
  },
});
