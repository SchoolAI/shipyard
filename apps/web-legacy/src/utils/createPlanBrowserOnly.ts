/**
 * Browser-only plan creation utility.
 *
 * Creates plans entirely in the browser without requiring server/tRPC.
 * Works on mobile devices where localhost servers are unavailable.
 *
 * How it works:
 * 1. Create a new Y.Doc with providers (IndexedDB, WebSocket, WebRTC)
 * 2. Initialize plan metadata using the same schema as the server
 * 3. Add entry to the plan-index Y.Doc
 * 4. The plan syncs automatically through connected providers
 *
 * This mirrors what the server's plan.create tRPC endpoint does,
 * but using browser-available providers instead of LevelDB.
 */

import { DEFAULT_EPOCH, initPlanMetadata, logPlanEvent, setPlanIndexEntry } from '@shipyard/schema';
import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
import { nanoid } from 'nanoid';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { generateSessionToken, hashSessionToken } from './browserCrypto';

/**
 * Result of browser-only plan creation.
 */
export interface CreatePlanBrowserResult {
  planId: string;
  sessionToken: string;
  url: string;
  ydoc: Y.Doc;
  /** Cleanup function to destroy providers when done */
  cleanup: () => void;
}

/**
 * Options for browser-only plan creation.
 */
export interface CreatePlanBrowserOptions {
  title: string;
  ownerId: string;
  /** Plan index Y.Doc (from usePlanIndexContext) */
  indexDoc: Y.Doc;
  /** Optional WebRTC signaling server URL */
  signalingServer?: string;
  /** Optional hub URL for WebSocket sync */
  hubUrl?: string;
}

/**
 * Default WebRTC signaling server URL.
 */
const DEFAULT_SIGNALING_SERVER =
  import.meta.env.MODE === 'production'
    ? 'wss://shipyard-signaling.jacob-191.workers.dev'
    : 'ws://localhost:4444';

/**
 * Discover the registry hub URL by checking known ports.
 * Returns null if no server is running (mobile/offline case).
 */
async function discoverHubUrl(): Promise<string | null> {
  const envPort = import.meta.env.VITE_REGISTRY_PORT;
  const envHubUrl = import.meta.env.VITE_HUB_URL;

  if (envHubUrl) {
    return envHubUrl;
  }

  const ports = envPort ? [Number.parseInt(envPort, 10)] : DEFAULT_REGISTRY_PORTS;

  for (const port of ports) {
    try {
      const res = await fetch(`http://localhost:${port}/registry`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        return `ws://localhost:${port}`;
      }
    } catch {
      /** Continue to next port */
    }
  }

  return null;
}

/**
 * Create a plan entirely in the browser.
 *
 * This function mirrors the server's plan.create endpoint but works without
 * a server connection. The plan is synced via:
 * - IndexedDB: Local persistence
 * - WebSocket: Server sync (when available)
 * - WebRTC: Peer-to-peer sync
 *
 * @param options - Plan creation options
 * @returns Plan creation result with cleanup function
 */
export async function createPlanBrowserOnly(
  options: CreatePlanBrowserOptions
): Promise<CreatePlanBrowserResult> {
  const { title, ownerId, indexDoc } = options;

  /** Generate unique IDs */
  const planId = nanoid();
  const sessionToken = generateSessionToken();
  const sessionTokenHash = await hashSessionToken(sessionToken);
  const now = Date.now();

  /** Create the plan Y.Doc */
  const ydoc = new Y.Doc();

  /**
   * Track all providers for cleanup.
   * We create providers BEFORE initializing data to ensure sync is ready.
   */
  const providers: Array<{ destroy: () => void }> = [];

  /** 1. IndexedDB persistence - always enabled for offline support */
  const idbProvider = new IndexeddbPersistence(planId, ydoc);
  providers.push(idbProvider);

  /** 2. WebSocket provider - connects to server if available */
  const hubUrl = options.hubUrl ?? (await discoverHubUrl());
  let wsProvider: WebsocketProvider | null = null;

  if (hubUrl) {
    wsProvider = new WebsocketProvider(hubUrl, planId, ydoc, {
      connect: true,
      maxBackoffTime: 2500,
      resyncInterval: 15000,
    });
    providers.push(wsProvider);
  }

  /** 3. WebRTC provider - peer-to-peer sync */
  const signalingServer = options.signalingServer ?? DEFAULT_SIGNALING_SERVER;
  const roomName = `shipyard-${planId}`;

  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  const rtcProvider = new WebrtcProvider(roomName, ydoc, {
    signaling: [signalingServer],
    peerOpts: {
      config: { iceServers },
    },
  });
  providers.push(rtcProvider);

  /**
   * Initialize plan metadata.
   * This must happen AFTER providers are connected so changes sync.
   */
  initPlanMetadata(ydoc, {
    id: planId,
    title,
    sessionTokenHash,
    ownerId,
    origin: { platform: 'browser' as const },
  });

  /** Log creation event */
  logPlanEvent(ydoc, 'plan_created', ownerId);

  /** Add to plan index */
  setPlanIndexEntry(indexDoc, {
    id: planId,
    title,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ownerId,
    deleted: false,
    epoch: DEFAULT_EPOCH,
  });

  /** Build plan URL */
  const webUrl = `${window.location.origin}/task/${planId}`;

  /** Create cleanup function */
  const cleanup = () => {
    for (const provider of providers) {
      try {
        provider.destroy();
      } catch {
        /** Ignore cleanup errors */
      }
    }
  };

  return {
    planId,
    sessionToken,
    url: webUrl,
    ydoc,
    cleanup,
  };
}
