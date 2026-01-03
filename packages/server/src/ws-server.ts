import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { WebSocket as WsWebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { logger } from './logger';

const WS_PORT = Number.parseInt(process.env.WS_PORT || '1234', 10);
const PERSISTENCE_DIR = join(homedir(), '.peer-plan', 'plans');

// Message types matching y-websocket protocol
const messageSync = 0;
const messageAwareness = 1;

// Store Y.Docs and awareness per document
const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const conns = new Map<string, Set<WsWebSocket>>();

// LevelDB persistence instance
let ldb: LeveldbPersistence;

async function getDoc(docName: string): Promise<Y.Doc> {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();

    // Load persisted state
    const persistedDoc = await ldb.getYDoc(docName);
    const state = Y.encodeStateAsUpdate(persistedDoc);
    Y.applyUpdate(doc, state);

    // Persist updates
    doc.on('update', (update: Uint8Array) => {
      ldb.storeUpdate(docName, update);
    });

    docs.set(docName, doc);

    // Create awareness for this doc
    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(docName, awareness);
  }
  return doc;
}

function send(ws: WsWebSocket, message: Uint8Array) {
  if (ws.readyState === ws.OPEN) {
    ws.send(message);
  }
}

function broadcastUpdate(docName: string, update: Uint8Array, origin: unknown) {
  const docConns = conns.get(docName);
  if (!docConns) return;

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);

  for (const conn of docConns) {
    if (conn !== origin) {
      send(conn, message);
    }
  }
}

export function startWebSocketServer(): WebSocketServer | null {
  try {
    // Ensure persistence directory exists
    mkdirSync(PERSISTENCE_DIR, { recursive: true });

    // Initialize LevelDB persistence
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);

    const wss = new WebSocketServer({ port: WS_PORT });

    // Handle server-level errors (like EADDRINUSE) gracefully
    wss.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn({ port: WS_PORT }, 'WebSocket port in use, sync disabled');
      } else {
        logger.error({ err }, 'WebSocket server error');
      }
    });

  wss.on('connection', async (ws, req) => {
    const planId = req.url?.slice(1) || 'default';
    logger.info({ planId }, 'WebSocket client connected');

    try {
      const doc = await getDoc(planId);
      const awareness = awarenessMap.get(planId)!;
      logger.debug({ planId }, 'Got doc and awareness');

    // Track connections per document
    if (!conns.has(planId)) {
      conns.set(planId, new Set());
    }
    conns.get(planId)!.add(ws);

    // Listen for document updates and broadcast
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      broadcastUpdate(planId, update, origin);
    };
    doc.on('update', updateHandler);

    // Listen for awareness updates
    const awarenessHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      _origin: unknown
    ) => {
      const changedClients = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      const message = encoding.toUint8Array(encoder);
      for (const conn of conns.get(planId) || []) {
        send(conn, message);
      }
    };
    awareness.on('update', awarenessHandler);

    // Send initial sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(ws, encoding.toUint8Array(encoder));

    // Send current awareness state
    const awarenessStates = awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
      );
      send(ws, encoding.toUint8Array(awarenessEncoder));
    }

    // Handle incoming messages
    ws.on('message', (message: Buffer) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case messageSync: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
            // Send response if encoder has content (sync step 2 or update)
            if (encoding.length(encoder) > 1) {
              send(ws, encoding.toUint8Array(encoder));
            }
            break;
          }
          case messageAwareness: {
            awarenessProtocol.applyAwarenessUpdate(
              awareness,
              decoding.readVarUint8Array(decoder),
              ws
            );
            break;
          }
        }
      } catch (err) {
        logger.error({ err, planId }, 'Failed to process message');
      }
    });

    ws.on('close', () => {
      logger.info({ planId }, 'WebSocket client disconnected');
      doc.off('update', updateHandler);
      awareness.off('update', awarenessHandler);
      conns.get(planId)?.delete(ws);
      awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
    });

    ws.on('error', (err: Error) => {
      logger.error({ err, planId }, 'WebSocket error');
    });
    } catch (err) {
      logger.error({ err, planId }, 'Error handling WebSocket connection');
      ws.close();
    }
  });

    logger.info({ port: WS_PORT, persistence: PERSISTENCE_DIR }, 'WebSocket server started');
    return wss;
  } catch (err) {
    logger.error({ err }, 'Failed to start WebSocket server, sync disabled');
    return null;
  }
}
