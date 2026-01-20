import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Vite plugin that serves the registry file at /api/registry
 */
function registryPlugin(): Plugin {
  const REGISTRY_FILE = join(homedir(), '.peer-plan', 'servers.json');

  return {
    name: 'registry-plugin',
    configureServer(server) {
      server.middlewares.use('/api/registry', (req, res) => {
        // Set CORS headers to allow browser access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        // Read the registry file
        if (!existsSync(REGISTRY_FILE)) {
          res.statusCode = 200;
          res.end(JSON.stringify({ servers: [] }));
          return;
        }

        try {
          const data = readFileSync(REGISTRY_FILE, 'utf-8');
          res.statusCode = 200;
          res.end(data);
        } catch (err) {
          console.error('Failed to read registry:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to read registry' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [registryPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
