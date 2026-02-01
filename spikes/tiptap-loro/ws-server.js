/**
 * Simple WebSocket server for loro-extended sync
 *
 * Relays messages between connected clients
 */
import { WebSocketServer } from 'ws';

const PORT = 8765;
const wss = new WebSocketServer({ port: PORT });

console.log(`WebSocket server listening on ws://localhost:${PORT}`);

// Track connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected. Total clients:', clients.size + 1);
  clients.add(ws);

  ws.on('message', (data) => {
    // Relay message to all other clients
    clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(data);
      }
    });
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected. Total clients:', clients.size);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});
