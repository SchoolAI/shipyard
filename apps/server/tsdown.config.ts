import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  // Externalize all dependencies for Node.js runtime
  // They'll be resolved from node_modules instead of bundled
  external: [
    // Externalize all node_modules
    /^[^./]/, // Match anything that doesn't start with . or /
  ],
});
