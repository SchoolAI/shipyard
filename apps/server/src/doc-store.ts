/**
 * Facade for Y.Doc access that routes to either:
 * - registry-server.ts (when this instance is the Registry Hub)
 * - hub-client.ts (when connecting to an existing Registry Hub)
 *
 * All code that needs Y.Docs should import from this module, not directly
 * from registry-server.ts or hub-client.ts.
 */

import type * as Y from 'yjs';
import {
  destroyHubClient,
  getOrCreateDoc as hubGetOrCreateDoc,
  hasActiveConnections as hubHasActiveConnections,
  initHubClient,
  isHubClientInitialized,
} from './hub-client.js';
import { logger } from './logger.js';
import {
  getOrCreateDoc as registryGetOrCreateDoc,
  hasActiveConnections as registryHasActiveConnections,
} from './registry-server.js';

type Mode = 'hub' | 'client' | 'uninitialized';

let currentMode: Mode = 'uninitialized';

/**
 * Initialize the doc store in "hub" mode.
 * Called when this instance IS the Registry Hub (started the registry server).
 * The WebSocket server is already running as part of the registry server.
 */
export function initAsHub(): void {
  if (currentMode !== 'uninitialized') {
    logger.warn({ currentMode }, 'Doc store already initialized');
    return;
  }

  // No need to start anything - registry-server already has WebSocket support
  currentMode = 'hub';
  logger.info('Doc store initialized as hub (registry server mode)');
}

/**
 * Initialize the doc store in "client" mode - connects to existing Registry Hub.
 * Called when another MCP instance is already running as Registry Hub.
 */
export async function initAsClient(registryPort: number): Promise<void> {
  if (currentMode !== 'uninitialized') {
    logger.warn({ currentMode }, 'Doc store already initialized');
    return;
  }

  await initHubClient(registryPort);
  currentMode = 'client';
  logger.info({ registryPort }, 'Doc store initialized as client (hub-client mode)');
}

/**
 * Get or create a Y.Doc by name.
 * Routes to the appropriate implementation based on initialization mode.
 */
export async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  switch (currentMode) {
    case 'hub':
      return registryGetOrCreateDoc(docName);
    case 'client':
      return hubGetOrCreateDoc(docName);
    case 'uninitialized':
      // Fallback: if doc-store wasn't explicitly initialized, check if hub-client
      // was initialized directly (for backwards compatibility during transition)
      if (isHubClientInitialized()) {
        currentMode = 'client';
        return hubGetOrCreateDoc(docName);
      }
      // Default to registry-server behavior for backwards compatibility
      logger.warn('Doc store not initialized, defaulting to registry server mode');
      currentMode = 'hub';
      return registryGetOrCreateDoc(docName);
  }
}

/**
 * Check if there are active connections for a plan.
 * Routes to the appropriate implementation based on initialization mode.
 * In client mode, this makes an HTTP request to the hub.
 */
export async function hasActiveConnections(planId: string): Promise<boolean> {
  switch (currentMode) {
    case 'hub':
      // Sync function in hub mode
      return registryHasActiveConnections(planId);
    case 'client':
      // Async function in client mode
      return await hubHasActiveConnections(planId);
    case 'uninitialized':
      // In uninitialized state, assume no connections
      return false;
  }
}

/**
 * Get the current mode of the doc store.
 */
export function getMode(): Mode {
  return currentMode;
}

/**
 * Cleanup function for graceful shutdown.
 * Only needed in client mode; hub mode cleanup is handled by registry-server.
 */
export async function destroy(): Promise<void> {
  if (currentMode === 'client') {
    await destroyHubClient();
  }
  currentMode = 'uninitialized';
}
