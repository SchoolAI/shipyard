import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: { tsconfig: './tsconfig.json' },
  sourcemap: true,
  external: ['node-pty', 'node-datachannel'],
});
