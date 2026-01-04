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
  return {
    name: 'github-pages-spa',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexPath = path.join(distDir, 'index.html');
      const notFoundPath = path.join(distDir, '404.html');
      const nojekyllPath = path.join(distDir, '.nojekyll');

      // Copy index.html to 404.html for SPA routing
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
      }

      // Create .nojekyll to prevent GitHub Pages from ignoring _-prefixed files
      fs.writeFileSync(nojekyllPath, '');
    },
  };
}

export default defineConfig({
  // Base path for GitHub Pages: https://schoolai.github.io/peer-plan/
  base: '/peer-plan/',
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
});
