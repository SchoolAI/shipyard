import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';
import { logger } from './logger';

const WS_PORT = Number.parseInt(process.env.WS_PORT || '1234', 10);
const PERSISTENCE_DIR = join(homedir(), '.peer-plan', 'plans');

// Store active Y.Docs and their update handlers
const docs = new Map<string, Y.Doc>();

export function startWebSocketServer(): WebSocketServer {
  // Ensure persistence directory exists
  mkdirSync(PERSISTENCE_DIR, { recursive: true });

  // Set up LevelDB persistence for Y.Docs
  const ldb = new LeveldbPersistence(PERSISTENCE_DIR);

  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on('connection', async (ws, req) => {
    const planId = req.url?.slice(1) || 'default';
    logger.info({ planId }, 'WebSocket client connected');

    // Get or create Y.Doc for this plan
    let ydoc = docs.get(planId);
    if (!ydoc) {
      ydoc = new Y.Doc();

      // Load persisted state
      const persistedDoc = await ldb.getYDoc(planId);
      const state = Y.encodeStateAsUpdate(persistedDoc);
      Y.applyUpdate(ydoc, state);

      // Persist updates as they happen
      ydoc.on('update', (update: Uint8Array) => {
        ldb.storeUpdate(planId, update);
      });

      docs.set(planId, ydoc);
    }

    // Handle incoming messages (Yjs sync protocol)
    ws.on('message', (message: Buffer) => {
      try {
        const update = new Uint8Array(message);
        Y.applyUpdate(ydoc as Y.Doc, update);
      } catch (err) {
        logger.error({ err, planId }, 'Failed to apply Yjs update');
      }
    });

    // Send current state to new client
    const currentState = Y.encodeStateAsUpdate(ydoc);
    ws.send(currentState);

    // Broadcast updates to all connected clients
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== ws) {
        ws.send(update);
      }
    };
    ydoc.on('update', updateHandler);

    ws.on('close', () => {
      logger.info({ planId }, 'WebSocket client disconnected');
      ydoc?.off('update', updateHandler);
    });

    ws.on('error', (err) => {
      logger.error({ err, planId }, 'WebSocket error');
    });
  });

  logger.info({ port: WS_PORT, persistence: PERSISTENCE_DIR }, 'WebSocket server started');
  return wss;
}
