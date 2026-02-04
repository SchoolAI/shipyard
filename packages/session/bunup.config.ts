import { defineConfig } from 'bunup';

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  dts: {
    /** Use tsc for declaration generation to handle Zod schema inference */
    inferTypes: true,
  },
  clean: false /** Don't clean in watch mode - bunup rebuilds changed files */,
});
