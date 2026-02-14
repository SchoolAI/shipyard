import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  server: {
    port: 5174,
  },
  // loro-crdt uses WASM and top-level await
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    // Exclude loro-crdt from pre-bundling (it has WASM)
    exclude: ['loro-crdt'],
  },
});
