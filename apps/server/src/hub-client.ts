/**
 * Hub client for MCP instances connecting to the Registry Hub.
 * When Registry Hub is already running, MCP instances become thin clients
 * that sync Y.Docs via WebSocket instead of running their own servers.
 *
 * ## Persistence Limitation
 *
 * Client MCPs do NOT have local persistence. All data is stored in the hub's
 * LevelDB. This means:
 *
 * - Hub persists all acknowledged Y.Doc updates
 * - Client MCP crash only loses in-flight operations (not yet confirmed by hub)
 * - Browser IndexedDB provides additional resilience
 *
 * This trade-off was chosen for simplicity (KISS principle). The risk is low
 * because y-websocket confirms sync before returning from operations.
 */

import { HasConnectionsResponseSchema, ROUTES } from '@shipyard/schema';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { logger } from './logger.js';

/** Track providers and docs for this client instance */
const providers = new Map<string, WebsocketProvider>();
const docs = new Map<string, Y.Doc>();

let hubPort: number | null = null;
let initialized = false;

/**
 * Initialize the hub client to connect to the Registry Hub.
 * Call this when registry is already running (from index.ts).
 */
export async function initHubClient(port: number): Promise<void> {
  if (initialized) {
    logger.warn('Hub client already initialized');
    return;
  }

  hubPort = port;
  initialized = true;
  logger.info({ hubPort }, 'Hub client initialized, will connect to registry hub');
}

/**
 * Check if the hub client has been initialized.
 */
export function isHubClientInitialized(): boolean {
  return initialized;
}

/**
 * Get or create a Y.Doc, connecting to the hub for sync.
 * This replaces the local WebSocket server pattern.
 */
export async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  /** Return cached doc if exists */
  const existing = docs.get(docName);
  if (existing) {
    return existing;
  }

  if (!initialized || !hubPort) {
    throw new Error('Hub client not initialized. Call initHubClient() first.');
  }

  /** Create new Y.Doc */
  const doc = new Y.Doc();
  docs.set(docName, doc);

  /** Connect to hub via WebSocket */
  const hubUrl = `ws://localhost:${hubPort}`;
  const provider = new WebsocketProvider(hubUrl, docName, doc, {
    connect: true,
    maxBackoffTime: 2500,
  });

  providers.set(docName, provider);

  /** Wait for initial sync before returning - REQUIRED for data integrity */
  await new Promise<void>((resolve, reject) => {
    /** Check if already synced (can happen if WebSocket connects immediately) */
    if (provider.synced) {
      logger.debug({ docName }, 'Provider already synced');
      resolve();
      return;
    }

    /*
     * Use 'sync' event with isSynced parameter (more reliable than 'once')
     * The 'sync' event fires when the document is synchronized with the server.
     * For empty documents, this happens immediately after WebSocket connection.
     */
    const onSync = (isSynced: boolean) => {
      if (isSynced) {
        logger.debug({ docName }, 'Provider synced via sync event');
        provider.off('sync', onSync);
        clearTimeout(timeoutId);
        resolve();
      }
    };

    provider.on('sync', onSync);

    /*
     * Timeout after 10 seconds - FAIL instead of proceeding with empty doc
     * Client MCPs MUST sync with hub to avoid data divergence
     */
    const timeoutId = setTimeout(() => {
      if (!provider.synced) {
        provider.off('sync', onSync);
        logger.error({ docName, synced: provider.synced }, 'Hub sync timeout - cannot proceed');
        reject(new Error(`Failed to sync document '${docName}' with hub within 10 seconds`));
      }
    }, 10000);
  });

  /*
   * NOTE: Do NOT attach observers here - hub handles all observer notifications
   * Client MCPs just receive updates via y-websocket sync
   * Attaching observers on client would cause duplicate notifications
   */

  logger.info({ docName, hubUrl }, 'Connected to hub for document sync');
  return doc;
}

/**
 * Check if there are active connections for a plan by querying the hub.
 * Makes an HTTP request to the registry to check connection state.
 */
export async function hasActiveConnections(planId: string): Promise<boolean> {
  if (!hubPort) return false;

  try {
    const res = await fetch(`http://localhost:${hubPort}${ROUTES.PLAN_HAS_CONNECTIONS(planId)}`, {
      signal: AbortSignal.timeout(500),
    });

    if (!res.ok) return false;

    const data = HasConnectionsResponseSchema.parse(await res.json());
    return data.hasConnections;
  } catch {
    /** Fail open - allow browser to open on error */
    return false;
  }
}

/**
 * Cleanup function for graceful shutdown.
 */
export async function destroyHubClient(): Promise<void> {
  for (const provider of providers.values()) {
    provider.disconnect();
    provider.destroy();
  }
  providers.clear();
  docs.clear();
  initialized = false;
  hubPort = null;
  logger.info('Hub client destroyed');
}
