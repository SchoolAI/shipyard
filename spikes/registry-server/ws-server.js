#!/usr/bin/env node

/**
 * WebSocket Server
 *
 * Minimal WebSocket server that:
 * 1. Starts on given port
 * 2. Registers itself in ~/.shipyard/servers.json
 * 3. Accepts WebSocket connections
 * 4. Echoes messages back to clients
 *
 * Usage: node ws-server.js [port]
 * Example: node ws-server.js 3100
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = process.argv[2] ? Number.parseInt(process.argv[2], 10) : 3100;
const REGISTRY_DIR = join(homedir(), '.shipyard');
const REGISTRY_PATH = join(REGISTRY_DIR, 'servers.json');

/**
 * Read existing registry, return empty structure if doesn't exist
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
 * Register this server in the registry file
 */
async function registerServer(port) {
  // Ensure directory exists
  await mkdir(REGISTRY_DIR, { recursive: true });

  // Read existing registry
  const registry = await readRegistry();

  // Add this server (or update if already exists)
  const serverEntry = {
    port,
    url: `ws://localhost:${port}`,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  // Remove any existing entry for this port
  registry.servers = registry.servers.filter((s) => s.port !== port);

  // Add new entry
  registry.servers.push(serverEntry);

  // Write back to file
  await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));

  console.log(`Registered with registry: ${REGISTRY_PATH}`);
  console.log(`Entry:`, JSON.stringify(serverEntry, null, 2));
}

/**
 * Unregister this server from the registry
 */
async function unregisterServer(port) {
  try {
    const registry = await readRegistry();
    registry.servers = registry.servers.filter((s) => s.port !== port);
    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    console.log(`Unregistered from registry: port ${port}`);
  } catch (err) {
    console.error('Error unregistering:', err);
  }
}

/**
 * Start WebSocket server
 */
const wss = new WebSocketServer({ port: PORT });

wss.on('listening', async () => {
  console.log(`WebSocket server listening on port ${PORT}`);
  console.log(`URL: ws://localhost:${PORT}`);

  // Register in the registry
  try {
    await registerServer(PORT);
  } catch (err) {
    console.error('Error registering server:', err);
    process.exit(1);
  }
});

wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);

  ws.on('message', (data) => {
    const message = data.toString();
    console.log(`[${new Date().toISOString()}] Received from ${clientId}: ${message}`);

    // Echo message back with server info
    const response = {
      type: 'echo',
      port: PORT,
      originalMessage: message,
      timestamp: new Date().toISOString(),
    };

    ws.send(JSON.stringify(response));
  });

  ws.on('close', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
  });

  ws.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] WebSocket error for ${clientId}:`, err);
  });

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: 'welcome',
      port: PORT,
      message: `Connected to WebSocket server on port ${PORT}`,
      timestamp: new Date().toISOString(),
    })
  );
});

wss.on('error', (err) => {
  console.error('WebSocket server error:', err);
});

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down WebSocket server...');

  // Close all connections
  wss.clients.forEach((client) => {
    client.close();
  });

  // Close server
  wss.close(async () => {
    console.log('WebSocket server stopped');

    // Unregister from registry
    await unregisterServer(PORT);

    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`Starting WebSocket server on port ${PORT}...`);
