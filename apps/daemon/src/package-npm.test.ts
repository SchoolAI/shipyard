import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface NpmPackage {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface WorkspacePackage {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function loadNpmPkg(daemonRoot: string): NpmPackage {
  return JSON.parse(readFileSync(resolve(daemonRoot, 'package-npm.json'), 'utf-8')) as NpmPackage;
}

function loadWorkspacePkg(daemonRoot: string): WorkspacePackage {
  return JSON.parse(readFileSync(resolve(daemonRoot, 'package.json'), 'utf-8')) as WorkspacePackage;
}

/**
 * Parse the `catalog:` section from pnpm-workspace.yaml.
 * Only needs the flat key-value pairs under `catalog:`, no full YAML parser needed.
 */
function loadCatalog(daemonRoot: string): Record<string, string> {
  const wsPath = resolve(daemonRoot, '../../pnpm-workspace.yaml');
  const lines = readFileSync(wsPath, 'utf-8').split('\n');
  const catalog: Record<string, string> = {};
  let inCatalog = false;

  for (const line of lines) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog && /^\S/.test(line)) break; // exited catalog block

    if (inCatalog) {
      const match = line.match(/^\s+(?:"([^"]+)"|([^:]+)):\s*"?([^"#\n]+)"?\s*$/);
      if (match) {
        const key = (match[1] ?? match[2])?.trim();
        const value = match[3]?.trim().replace(/^["']|["']$/g, '');
        if (key && value) catalog[key] = value;
      }
    }
  }
  return catalog;
}

function parseTsupExternals(daemonRoot: string): string[] {
  const tsupConfig = readFileSync(resolve(daemonRoot, 'tsup.config.ts'), 'utf-8');
  const externalMatch = tsupConfig.match(/external:\s*\[([^\]]+)\]/);
  if (!externalMatch?.[1]) throw new Error('Could not find external array in tsup.config.ts');
  return [...externalMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((s): s is string => s !== undefined);
}

describe('package-npm.json', () => {
  const daemonRoot = resolve(import.meta.dirname, '..');

  it('declares all tsup external packages as runtime dependencies', () => {
    const externals = parseTsupExternals(daemonRoot);
    expect(externals.length).toBeGreaterThan(0);

    const npmPkg = loadNpmPkg(daemonRoot);
    const allDeps = { ...npmPkg.dependencies, ...npmPkg.optionalDependencies };

    for (const pkg of externals) {
      expect(
        allDeps,
        `'${pkg}' is in tsup external list but missing from package-npm.json`
      ).toHaveProperty(pkg);
    }
  });

  it('npm dependency versions exactly match workspace package.json versions', () => {
    const npmPkg = loadNpmPkg(daemonRoot);
    const wsPkg = loadWorkspacePkg(daemonRoot);
    const catalog = loadCatalog(daemonRoot);

    const npmDeps = { ...npmPkg.dependencies, ...npmPkg.optionalDependencies };
    const wsDeps = { ...wsPkg.dependencies, ...wsPkg.devDependencies };

    for (const [pkg, npmRange] of Object.entries(npmDeps)) {
      const wsRange = wsDeps[pkg];
      if (!wsRange) continue;
      if (wsRange.startsWith('workspace:')) continue;

      const resolvedWsRange = wsRange === 'catalog:' ? catalog[pkg] : wsRange;
      if (!resolvedWsRange) {
        throw new Error(
          `'${pkg}' uses catalog: in package.json but is not defined in pnpm-workspace.yaml catalog`
        );
      }

      expect(
        npmRange,
        `Version mismatch for '${pkg}': package-npm.json has "${npmRange}" but package.json resolves "${resolvedWsRange}". They must match exactly.`
      ).toBe(resolvedWsRange);
    }
  });
});
