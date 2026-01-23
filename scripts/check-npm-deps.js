#!/usr/bin/env node
/**
 * Validates that package-npm.json has all runtime dependencies from apps/server/package.json.
 * Run in CI to prevent missing dependency issues like @ffmpeg-installer/ffmpeg.
 *
 * Usage: node scripts/check-npm-deps.js
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const serverPkg = JSON.parse(
  readFileSync(join(rootDir, 'apps/server/package.json'), 'utf8')
);
const npmPkg = JSON.parse(
  readFileSync(join(rootDir, 'package-npm.json'), 'utf8')
);

const serverDeps = serverPkg.dependencies || {};
const npmDeps = npmPkg.dependencies || {};

// Dependencies that are bundled and don't need to be in package-npm.json
const bundledDeps = [
  // Add any deps that are fully bundled (not external) here
];

const missing = [];
const versionMismatch = [];

for (const [dep, version] of Object.entries(serverDeps)) {
  if (bundledDeps.includes(dep)) continue;

  if (!npmDeps[dep]) {
    missing.push(dep);
  } else if (npmDeps[dep] !== version) {
    versionMismatch.push({
      dep,
      server: version,
      npm: npmDeps[dep],
    });
  }
}

let hasErrors = false;

if (missing.length > 0) {
  console.error('❌ Missing dependencies in package-npm.json:');
  for (const dep of missing) {
    console.error(`   - ${dep}: ${serverDeps[dep]}`);
  }
  console.error('');
  console.error('Add these to package-npm.json dependencies to fix.');
  hasErrors = true;
}

if (versionMismatch.length > 0) {
  console.warn('⚠️  Version mismatches (server vs npm):');
  for (const { dep, server, npm } of versionMismatch) {
    console.warn(`   - ${dep}: ${npm} → ${server}`);
  }
  console.warn('');
  console.warn('Consider updating package-npm.json to match server versions.');
  // Version mismatches are warnings, not errors (semver ranges may be intentional)
}

if (hasErrors) {
  process.exit(1);
}

console.log('✅ package-npm.json dependencies are in sync with apps/server/package.json');
