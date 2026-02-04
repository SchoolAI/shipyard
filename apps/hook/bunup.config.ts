import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false /** Project references break type gen with workspace packages */,
  clean: true,
  /**
   * NOTE: No banner needed - Bun's bundler preserves the shebang from src/index.ts
   * The source file has #!/usr/bin/env bun which gets included automatically.
   */
  /**
   * Bundle ALL dependencies for npm publishing (npx needs standalone binary)
   * But keep Node.js built-ins external (Bun provides compatibility)
   */
  external: [
    'node:*' /** Node.js built-in modules with node: prefix */,
    'fs',
    'path',
    'os',
    'crypto',
    'util',
    'stream',
    'events',
    'http',
    'https',
    'net',
    'tls',
    'zlib',
    'child_process',
    'buffer',
    'url',
    'querystring',
    'assert',
    'constants',
    'module',
    'process',
    'v8',
    'vm',
    'worker_threads',
  ],
  noExternal: [/.*/] /** Bundle everything else */,
  target: 'bun',
  minify: false /** Keep readable for debugging */,
});
