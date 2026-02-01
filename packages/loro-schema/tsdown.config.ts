import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/shapes.ts',
    'src/validators.ts',
    'src/types.ts',
    'src/helpers.ts',
    'src/url-encoding.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: false,
});
