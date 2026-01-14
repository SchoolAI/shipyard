/**
 * Hub client for MCP instances connecting to the Registry Hub.
 * When Registry Hub is already running, MCP instances become thin clients
 * that sync Y.Docs via WebSocket instead of running their own servers.
 */

import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { logger } from './logger.js';

// Track providers and docs for this client instance
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
  // Return cached doc if exists
  const existing = docs.get(docName);
  if (existing) {
    return existing;
  }

  if (!initialized || !hubPort) {
    throw new Error('Hub client not initialized. Call initHubClient() first.');
  }

  // Create new Y.Doc
  const doc = new Y.Doc();
  docs.set(docName, doc);

  // Connect to hub via WebSocket
  const hubUrl = `ws://localhost:${hubPort}`;
  const provider = new WebsocketProvider(hubUrl, docName, doc, {
    connect: true,
    maxBackoffTime: 2500,
  });

  providers.set(docName, provider);

  // Wait for initial sync before returning - REQUIRED for data integrity
  await new Promise<void>((resolve, reject) => {
    if (provider.synced) {
      resolve();
      return;
    }
    provider.once('sync', () => {
      resolve();
    });
    // Timeout after 10 seconds - FAIL instead of proceeding with empty doc
    // Client MCPs MUST sync with hub to avoid data divergence
    setTimeout(() => {
      if (!provider.synced) {
        logger.error({ docName }, 'Hub sync timeout - cannot proceed with empty doc');
        reject(new Error(`Failed to sync document '${docName}' with hub within 10 seconds`));
      }
    }, 10000);
  });

  // NOTE: Do NOT attach observers here - hub handles all observer notifications
  // Client MCPs just receive updates via y-websocket sync
  // Attaching observers on client would cause duplicate notifications

  logger.info({ docName, hubUrl }, 'Connected to hub for document sync');
  return doc;
}

/**
 * Check if there are active connections for a plan.
 *
 * LIMITATION: In client mode, we cannot know if the hub has active connections
 * without making an async HTTP call to the registry (but this function is sync).
 *
 * TRADE-OFF: We return false, which may open duplicate browser tabs if the hub
 * already has a browser connected. This is annoying UX but not a data integrity issue.
 *
 * FUTURE: Consider adding an HTTP endpoint like GET /api/plan/:id/connections
 * and making this function async, or accept the duplicate tab limitation.
 */
export function hasActiveConnections(_planId: string): boolean {
  // In client mode, return false (may open duplicate tabs)
  // In practice, browser opening is fast and user can close duplicates
  return false;
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
