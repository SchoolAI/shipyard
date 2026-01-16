/**
 * Facade for Y.Doc access that routes to either:
 * - registry-server.ts (when this instance is the Registry Hub)
 * - hub-client.ts (when connecting to an existing Registry Hub)
 *
 * All code that needs Y.Docs should import from this module, not directly
 * from registry-server.ts or hub-client.ts.
 */

import type { WebrtcProvider } from 'y-webrtc';
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
import { createWebRtcProvider, destroyWebRtcProvider } from './webrtc-provider.js';

type Mode = 'hub' | 'client' | 'uninitialized';

let currentMode: Mode = 'uninitialized';

// WebRTC providers for P2P sync (shared across both hub and client modes)
const webrtcProviders = new Map<string, WebrtcProvider>();

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
 * Also initializes WebRTC P2P provider for remote browser sync.
 */
export async function getOrCreateDoc(docName: string): Promise<Y.Doc> {
  // Get doc from hub or client
  let doc: Y.Doc;
  switch (currentMode) {
    case 'hub':
      doc = await registryGetOrCreateDoc(docName);
      break;
    case 'client':
      doc = await hubGetOrCreateDoc(docName);
      break;
    case 'uninitialized':
      // Fallback: if doc-store wasn't explicitly initialized, check if hub-client
      // was initialized directly (for backwards compatibility during transition)
      if (isHubClientInitialized()) {
        currentMode = 'client';
        doc = await hubGetOrCreateDoc(docName);
      } else {
        // Default to registry-server behavior for backwards compatibility
        logger.warn('Doc store not initialized, defaulting to registry server mode');
        currentMode = 'hub';
        doc = await registryGetOrCreateDoc(docName);
      }
  }

  // Add WebRTC provider for P2P sync (enabled by default)
  if (!webrtcProviders.has(docName)) {
    try {
      const provider = await createWebRtcProvider(doc, docName);
      webrtcProviders.set(docName, provider);
      logger.info({ docName }, 'WebRTC P2P sync enabled for plan');
    } catch (error) {
      logger.error({ error, docName }, 'Failed to create WebRTC provider - P2P sync unavailable');
      // Continue without WebRTC - local sync still works
    }
  }

  return doc;
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
 * Destroys WebRTC providers and client connections.
 */
export async function destroy(): Promise<void> {
  // Clean up all WebRTC providers
  for (const [docName, provider] of webrtcProviders.entries()) {
    destroyWebRtcProvider(provider, docName);
  }
  webrtcProviders.clear();

  // Clean up hub client if in client mode
  if (currentMode === 'client') {
    await destroyHubClient();
  }

  currentMode = 'uninitialized';
}
