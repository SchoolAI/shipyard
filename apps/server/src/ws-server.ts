import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { WebSocket as WsWebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { logger } from './logger';
import { registerWithRegistry, unregisterFromRegistry } from './registry-client.js';
import { attachObservers } from './subscriptions/index.js';

// Per-instance LevelDB to avoid locking conflicts
const PERSISTENCE_DIR = join(homedir(), '.peer-plan', 'plans', `session-${process.pid}`);

// Message types matching y-websocket protocol
const messageSync = 0;
const messageAwareness = 1;

const docs = new Map<string, Y.Doc>();
const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
const conns = new Map<string, Set<WsWebSocket>>();

let ldb: LeveldbPersistence | null = null;

/**
 * Ensures LevelDB persistence is initialized.
 * Called automatically by startWebSocketServer, but can be called independently.
 */
export function initPersistence(): void {
  if (!ldb) {
    mkdirSync(PERSISTENCE_DIR, { recursive: true });
    ldb = new LeveldbPersistence(PERSISTENCE_DIR);
  }
}

async function getDoc(docName: string): Promise<Y.Doc> {
  initPersistence();
  const persistence = ldb;
  if (!persistence) {
    throw new Error('LevelDB persistence failed to initialize');
  }

  let doc = docs.get(docName);
  if (!doc) {
    doc = new Y.Doc();

    const persistedDoc = await persistence.getYDoc(docName);
    const state = Y.encodeStateAsUpdate(persistedDoc);
    Y.applyUpdate(doc, state);

    doc.on('update', (update: Uint8Array) => {
      persistence.storeUpdate(docName, update);
    });

    docs.set(docName, doc);

    const awareness = new awarenessProtocol.Awareness(doc);
    awarenessMap.set(docName, awareness);

    // Attach observers for subscription notifications
    attachObservers(docName, doc);
  }
  return doc;
}

/**
 * Gets or creates a Y.Doc by name. Exported for use by MCP tools.
 * This function ensures persistence is initialized before accessing docs.
 */
export async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  return getDoc(docName);
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
    initPersistence();

    // Use port 0 for dynamic allocation (OS assigns available port)
    const wss = new WebSocketServer({ port: 0 });

    wss.on('listening', async () => {
      const addr = wss.address() as { port: number };
      logger.info({ port: addr.port, persistence: PERSISTENCE_DIR }, 'WebSocket server started');
      await registerWithRegistry(addr.port);
    });

    wss.on('error', (err: Error & { code?: string }) => {
      logger.error({ err }, 'WebSocket server error');
    });

    wss.on('connection', async (ws, req) => {
      const planId = req.url?.slice(1) || 'default';
      logger.info({ planId }, 'WebSocket client connected');

      try {
        const doc = await getDoc(planId);
        const awareness = awarenessMap.get(planId);
        if (!awareness) {
          throw new Error(`Awareness not found for planId: ${planId}`);
        }
        logger.debug({ planId }, 'Got doc and awareness');

        if (!conns.has(planId)) {
          conns.set(planId, new Set());
        }
        const planConns = conns.get(planId);
        planConns?.add(ws);

        const updateHandler = (update: Uint8Array, origin: unknown) => {
          broadcastUpdate(planId, update, origin);
        };
        doc.on('update', updateHandler);

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

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeSyncStep1(encoder, doc);
        send(ws, encoding.toUint8Array(encoder));

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

        ws.on('message', (message: Buffer) => {
          try {
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
              case messageSync: {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, messageSync);
                syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
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

    // Cleanup on shutdown (ensure we only run once)
    let isShuttingDown = false;
    const cleanup = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info('Shutting down WebSocket server');
      await unregisterFromRegistry();
      wss.close();
    };

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });

    return wss;
  } catch (err) {
    logger.error({ err }, 'Failed to start WebSocket server, sync disabled');
    return null;
  }
}
