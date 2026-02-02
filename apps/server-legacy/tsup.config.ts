import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false /** Project references break tsup type gen with workspace packages */,
  clean: true,
  sourcemap: false /** Exclude source maps from production builds (reduces size 43%) */,
  /**
   * Bundle workspace packages only for npm publishing
   * External dependencies will be installed by npm when package is installed
   */
  noExternal: ['@shipyard/schema', '@shipyard/shared'],
  /**
   * Exclude daemon dist files - server imports them dynamically at runtime
   */
  external: [/\.\.\/daemon\/dist/],
  target: 'node22.14',
  shims: false,
});
