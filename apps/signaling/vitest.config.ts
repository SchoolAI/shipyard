import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import {
  DEFAULT_TIER_THRESHOLDS,
  generateCoverageThresholds,
} from './scripts/analyze-fan-in'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Coverage model enforces testing based on blast radius (see engineering-standards.md).
 * Run `pnpm analyze:fan-in` to see which files get strict thresholds.
 * Disable with: DISABLE_FANIN_COVERAGE=1
 */
const fanInEnabled = !process.env.DISABLE_FANIN_COVERAGE
const fanInThresholds = generateCoverageThresholds(
  './src',
  DEFAULT_TIER_THRESHOLDS,
  fanInEnabled,
)

export default defineWorkersConfig({
  test: {
    passWithNoTests: true,
    retry: 0,
    globals: true,

    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            // Test environment variables
            ENVIRONMENT: 'test',
            LOG_LEVEL: 'error',
            // GitHub OAuth credentials (test values)
            GITHUB_CLIENT_ID: 'test-github-client-id',
            GITHUB_CLIENT_SECRET: 'test-github-client-secret',
            // JWT secret for signing (must be non-empty)
            JWT_SECRET: 'test-jwt-secret-for-testing-purposes-only-at-least-32-characters-long',
          },
        },
      },
    },

    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/test-utils/**',
        'src/**/__tests__/**',
      ],
      thresholds: {
        functions: 30,
        ...fanInThresholds,
      },
    },

    exclude: ['node_modules', 'dist'],
  },
})
