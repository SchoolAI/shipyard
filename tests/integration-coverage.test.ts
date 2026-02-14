/**
 * Meta-test: Integration Test Coverage Enforcement
 *
 * This test ensures that specified source files have corresponding integration tests.
 * It scans configured directories and verifies each source file has a matching test file.
 *
 * Philosophy: "Enforcement by test failure" - this runs as part of the normal test suite
 * and fails CI if coverage rules are violated.
 *
 * Reference: Fan-In Coverage Model from engineering-standards.md
 * - Tier 1: Shared infrastructure (fan-in ≥ 3) → 60% branch coverage
 * - Tier 2: Public interface (routes/tools) → Integration test MUST exist (this file)
 * - Tier 3: Safety net → 30% function coverage globally
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');

/**
 * Configuration for directories that require integration test coverage.
 *
 * Each entry specifies:
 * - `sourceDir`: Directory containing source files (relative to project root)
 * - `testSuffix`: Expected test file suffix (e.g., '.integration.test.ts', '.test.ts')
 * - `sourcePattern`: Regex to match source files (excludes test files by default)
 * - `description`: Human-readable description for error messages
 */
interface CoverageRequirement {
  sourceDir: string;
  testSuffix: string;
  sourcePattern: RegExp;
  description: string;
}

/**
 * Directories that require integration test coverage.
 *
 * Add new entries as apps are built. Each entry requires every source
 * file matching `sourcePattern` in `sourceDir` to have a corresponding
 * test file with `testSuffix`.
 *
 * Example entry for a new app:
 *
 * ```typescript
 * {
 *   sourceDir: 'apps/my-app/src/routes',
 *   testSuffix: '.test.ts',
 *   sourcePattern: /^(?!.*\.test\.ts$).*\.ts$/,
 *   description: 'My App Routes',
 * },
 * ```
 */
const COVERAGE_REQUIREMENTS: CoverageRequirement[] = [
  {
    sourceDir: 'apps/session-server/src/routes',
    testSuffix: '.test.ts',
    sourcePattern: /^(?!.*\.test\.ts$).*\.ts$/,
    description: 'Session Server Routes',
  },
  {
    sourceDir: 'packages/loro-schema/src',
    testSuffix: '.test.ts',
    sourcePattern: /^(shapes|ids|epoch)\.ts$/,
    description: 'Loro Schema High Fan-In Models',
  },
  {
    sourceDir: 'apps/daemon/src',
    testSuffix: '.test.ts',
    sourcePattern: /^(session-manager|file-storage-adapter|lifecycle|capabilities|signaling)\.ts$/,
    description: 'Daemon Core Modules',
  },
  {
    sourceDir: 'apps/web/src/hooks',
    testSuffix: '.test.ts',
    sourcePattern: /^(?!.*\.test\.ts$).*\.ts$/,
    description: 'Web App Hooks',
  },
];

interface FileInfo {
  name: string;
  sourcePath: string;
  expectedTestPath: string;
  hasTest: boolean;
}

function findSourceFiles(requirement: CoverageRequirement): FileInfo[] {
  const sourceDir = path.join(ROOT_DIR, requirement.sourceDir);

  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  const files = fs.readdirSync(sourceDir);
  const sourceFiles = files.filter((f) => requirement.sourcePattern.test(f));

  return sourceFiles.map((file) => {
    const baseName = file.replace(/\.ts$/, '');
    const expectedTestPath = path.join(sourceDir, `${baseName}${requirement.testSuffix}`);

    return {
      name: file,
      sourcePath: path.join(sourceDir, file),
      expectedTestPath,
      hasTest: fs.existsSync(expectedTestPath),
    };
  });
}

function formatMissingTests(files: FileInfo[], requirement: CoverageRequirement): string {
  const missing = files.filter((f) => !f.hasTest);

  if (missing.length === 0) {
    return '';
  }

  const lines = [
    `\n${requirement.description} missing integration tests:`,
    '',
    ...missing.map((f) => {
      const relativePath = path.relative(ROOT_DIR, f.expectedTestPath);
      return `  - ${f.name} → create: ${relativePath}`;
    }),
    '',
    `Total: ${missing.length} file(s) missing tests in ${requirement.sourceDir}`,
  ];

  return lines.join('\n');
}

describe('Integration Test Coverage', () => {
  if (COVERAGE_REQUIREMENTS.length === 0) {
    it.skip('no coverage requirements configured (see TODO in test file)', () => {
      // This test is skipped until directories are configured
    });
    return;
  }

  for (const requirement of COVERAGE_REQUIREMENTS) {
    describe(requirement.description, () => {
      const files = findSourceFiles(requirement);

      if (files.length === 0) {
        it.skip(`no source files found in ${requirement.sourceDir}`, () => {
          // Directory is empty or doesn't exist
        });
        return;
      }

      it(`all source files in ${requirement.sourceDir} have integration tests`, () => {
        const missing = files.filter((f) => !f.hasTest);

        if (missing.length > 0) {
          const errorMessage = formatMissingTests(files, requirement);
          expect.fail(errorMessage);
        }

        expect(missing).toHaveLength(0);
      });

      it(`reports coverage stats for ${requirement.description}`, () => {
        const covered = files.filter((f) => f.hasTest).length;
        const total = files.length;
        const percentage = total > 0 ? Math.round((covered / total) * 100) : 100;

        console.log(`  ${requirement.description}: ${covered}/${total} (${percentage}%)`);

        expect(covered).toBe(total);
      });
    });
  }
});
