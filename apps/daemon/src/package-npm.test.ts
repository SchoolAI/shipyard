import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package-npm.json', () => {
  it('declares all tsup external packages as runtime dependencies', () => {
    const daemonRoot = resolve(import.meta.dirname, '..');

    const tsupConfig = readFileSync(resolve(daemonRoot, 'tsup.config.ts'), 'utf-8');
    const externalMatch = tsupConfig.match(/external:\s*\[([^\]]+)\]/);
    if (!externalMatch?.[1]) throw new Error('Could not find external array in tsup.config.ts');

    const externals = [...externalMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .filter((s): s is string => s !== undefined);
    expect(externals.length).toBeGreaterThan(0);

    interface NpmPackage {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }
    const npmPkg = JSON.parse(
      readFileSync(resolve(daemonRoot, 'package-npm.json'), 'utf-8')
    ) as NpmPackage;

    const allDeps = { ...npmPkg.dependencies, ...npmPkg.optionalDependencies };

    // Every package in tsup's external list must be declared in the npm package.
    // If this fails, add the missing package to package-npm.json dependencies.
    for (const pkg of externals) {
      expect(
        allDeps,
        `'${pkg}' is in tsup external list but missing from package-npm.json`
      ).toHaveProperty(pkg);
    }
  });
});
