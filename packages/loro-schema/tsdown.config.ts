import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/shapes.ts',
    'src/ids.ts',
    'src/task-document.ts',
    'src/room-document.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: false,
});
