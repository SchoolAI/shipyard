#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

// Registry file path in ~/.shipyard/servers.json
const REGISTRY_DIR = join(homedir(), '.shipyard');
const REGISTRY_FILE = join(REGISTRY_DIR, 'servers.json');

/**
 * Read the current registry
 */
function readRegistry() {
  if (!existsSync(REGISTRY_FILE)) {
    return { servers: [] };
  }
  try {
    const data = readFileSync(REGISTRY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read registry:', err);
    return { servers: [] };
  }
}

/**
 * Write to the registry
 */
function writeRegistry(registry) {
  // Ensure directory exists
  if (!existsSync(REGISTRY_DIR)) {
    mkdirSync(REGISTRY_DIR, { recursive: true });
  }

  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Register this server in the registry
 */
function registerServer(port, serverId) {
  const registry = readRegistry();

  // Add this server
  registry.servers.push({
    id: serverId,
    port,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  writeRegistry(registry);
  console.log(`[Registry] Registered server ${serverId} on port ${port}`);
}

/**
 * Remove this server from the registry
 */
function unregisterServer(serverId) {
  const registry = readRegistry();

  // Remove this server
  registry.servers = registry.servers.filter((s) => s.id !== serverId);

  writeRegistry(registry);
  console.log(`[Registry] Unregistered server ${serverId}`);
}

/**
 * Start a WebSocket echo server
 */
function startServer() {
  // Use port 0 to get a random available port
  const wss = new WebSocketServer({ port: 0 });

  // Generate a unique server ID
  const serverId = `server-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  wss.on('listening', () => {
    const actualPort = wss.address().port;
    console.log(`[${serverId}] WebSocket server listening on port ${actualPort}`);

    // Register in the registry
    registerServer(actualPort, serverId);
  });

  wss.on('connection', (ws) => {
    console.log(`[${serverId}] Client connected`);

    ws.on('message', (data) => {
      const message = data.toString();
      console.log(`[${serverId}] Received: ${message}`);

      // Echo the message back
      ws.send(`[${serverId}] Echo: ${message}`);
    });

    ws.on('close', () => {
      console.log(`[${serverId}] Client disconnected`);
    });

    ws.on('error', (err) => {
      console.error(`[${serverId}] WebSocket error:`, err);
    });
  });

  wss.on('error', (err) => {
    console.error(`[${serverId}] Server error:`, err);
  });

  // Clean up on shutdown
  const cleanup = () => {
    console.log(`\n[${serverId}] Shutting down...`);
    unregisterServer(serverId);
    wss.close(() => {
      console.log(`[${serverId}] Server closed`);
      process.exit(0);
    });
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return { wss, serverId };
}

// Start the server
startServer();
