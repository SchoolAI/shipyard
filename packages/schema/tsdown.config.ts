import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/plan.ts', 'src/url-encoding.ts', 'src/yjs-helpers.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
