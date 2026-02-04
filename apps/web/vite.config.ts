import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

function githubPagesSpa(): Plugin {
  let outDir: string;

  return {
    name: 'github-pages-spa',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        const distDir = path.resolve(__dirname, outDir);
        const indexPath = path.join(distDir, 'index.html');
        const notFoundPath = path.join(distDir, '404.html');
        const nojekyllPath = path.join(distDir, '.nojekyll');

        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }

        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
        }

        fs.writeFileSync(nojekyllPath, '');
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/shipyard/' : '/',
  plugins: [wasm(), tailwindcss(), react(), githubPagesSpa()],
  server: {
    port: Number.parseInt(process.env.VITE_PORT || '5173', 10),
    host: true,
    open: true,
    watch: {
      ignored: ['!**/node_modules/@shipyard/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['@shipyard/loro-schema', 'loro-crdt'],
  },
}));
