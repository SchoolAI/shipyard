#!/usr/bin/env node

import { WebSocketServer } from 'ws';

const MIN_PORT = 1234;
const MAX_PORT = 1244;

// Get random port in range
function getRandomPort() {
  return Math.floor(Math.random() * (MAX_PORT - MIN_PORT + 1)) + MIN_PORT;
}

// Try to start server on a port, retry if taken
function startServer(preferredPort = null) {
  const port = preferredPort || getRandomPort();
  const wss = new WebSocketServer({ port }, () => {
    console.log(`✓ WebSocket server running on ws://localhost:${port}`);
    console.log(`  Server ID: ${serverId}`);
  });

  const serverId = `server-${port}-${Date.now()}`;

  wss.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`✗ Port ${port} in use, trying another...`);
      startServer(); // Try again with different port
    } else {
      console.error('Server error:', error);
    }
  });

  wss.on('connection', (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    console.log(`[${port}] Client connected: ${clientId}`);

    // Send welcome message with server info
    ws.send(
      JSON.stringify({
        type: 'welcome',
        serverId,
        port,
        timestamp: Date.now(),
      })
    );

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[${port}] Received:`, message);

        // Echo back with server info
        ws.send(
          JSON.stringify({
            type: 'echo',
            serverId,
            port,
            original: message,
            timestamp: Date.now(),
          })
        );
      } catch (e) {
        console.error(`[${port}] Failed to parse message:`, e);
      }
    });

    ws.on('close', () => {
      console.log(`[${port}] Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      console.error(`[${port}] WebSocket error:`, error);
    });
  });

  return wss;
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});

// Start server
const portArg = process.argv[2] ? parseInt(process.argv[2]) : null;
startServer(portArg);
