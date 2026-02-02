import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ids.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: false,
});
