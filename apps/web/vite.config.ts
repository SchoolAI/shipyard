import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Plugin to copy index.html to 404.html for GitHub Pages SPA support.
 * GitHub Pages serves 404.html for unknown paths, allowing client-side routing.
 */
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

        // Ensure dist directory exists
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }

        // Copy index.html to 404.html for SPA routing
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
        }

        // Create .nojekyll to prevent GitHub Pages from ignoring _-prefixed files
        fs.writeFileSync(nojekyllPath, '');
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Base path for GitHub Pages: https://schoolai.github.io/peer-plan/
  // Use '/' for development, '/peer-plan/' for production
  base: mode === 'production' ? '/peer-plan/' : '/',
  plugins: [tailwindcss(), react(), githubPagesSpa()],
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
