#!/usr/bin/env node

/**
 * Registry Server
 *
 * HTTP server on port 3001 that serves the WebSocket server registry.
 * Reads from ~/.peer-plan/servers.json and serves via GET /registry endpoint.
 * Includes CORS headers for browser access.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PORT = 3001;
const REGISTRY_PATH = join(homedir(), '.peer-plan', 'servers.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read registry file, return empty array if file doesn't exist
 */
async function readRegistry() {
  try {
    const content = await readFile(REGISTRY_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { servers: [] };
    }
    throw err;
  }
}

/**
 * Serve index.html for browser testing
 */
async function serveIndexHtml() {
  try {
    return await readFile(join(__dirname, 'index.html'), 'utf8');
  } catch (err) {
    return '<html><body><h1>index.html not found</h1><p>Open index.html directly in browser</p></body></html>';
  }
}

/**
 * HTTP server that serves registry JSON
 */
const server = createServer(async (req, res) => {
  // CORS headers for browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Serve registry JSON
  if (req.url === '/registry') {
    try {
      const registry = await readRegistry();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(registry, null, 2));
      console.log(`[${new Date().toISOString()}] Served registry: ${registry.servers.length} servers`);
    } catch (err) {
      console.error('Error reading registry:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read registry' }));
    }
    return;
  }

  // Serve index.html at root
  if (req.url === '/' || req.url === '/index.html') {
    const html = await serveIndexHtml();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Registry server running at http://localhost:${PORT}`);
  console.log(`Serving registry from: ${REGISTRY_PATH}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /registry - JSON list of WebSocket servers`);
  console.log(`  GET /        - Test HTML page`);
  console.log(`\nTest with: curl http://localhost:${PORT}/registry`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down registry server...');
  server.close(() => {
    console.log('Registry server stopped');
    process.exit(0);
  });
});
