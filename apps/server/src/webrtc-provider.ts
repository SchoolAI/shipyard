import wrtc from '@roamhq/wrtc';
import {
  type EnvironmentContext,
  getSignalingConnections,
  type OriginPlatform,
} from '@shipyard/schema';
import { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';
import { logger } from './logger.js';
import { getEnvironmentContext, getGitHubUsername } from './server-identity.js';

/**
 * MCP awareness state broadcasted to peers.
 * Matches PlanAwarenessState from web package but defined locally to avoid circular dependency.
 */
interface McpAwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  platform: OriginPlatform;
  status: 'approved' | 'pending' | 'rejected';
  isOwner: boolean;
  webrtcPeerId: string;
  context?: EnvironmentContext;
}

/**
 * WebRTC signaling server URL.
 *
 * Uses NODE_ENV-based defaults:
 * - development (default): ws://localhost:4444
 * - production: wss://shipyard-signaling.jacob-191.workers.dev
 *
 * Can be overridden with SIGNALING_URL environment variable.
 */
const SIGNALING_SERVER =
  process.env.SIGNALING_URL ||
  (() => {
    const nodeEnv = process.env.NODE_ENV || 'development';
    return nodeEnv === 'production'
      ? 'wss://shipyard-signaling.jacob-191.workers.dev'
      : 'ws://localhost:4444';
  })();

/**
 * Create a WebRTC provider that connects MCP to the peer mesh.
 * This enables direct P2P sync with remote browsers without requiring a localhost browser.
 *
 * @param ydoc - The Yjs document to sync
 * @param planId - The plan ID (used as room name)
 * @returns WebrtcProvider instance
 */
/**
 * Polyfill global WebRTC objects for simple-peer (done once at module load).
 * TypeScript's globalThis has strict index signature that doesn't allow arbitrary property assignment.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Node.js polyfill for WebRTC globals required by simple-peer
const globalAny = globalThis as Record<string, unknown>;
if (typeof globalAny.RTCPeerConnection === 'undefined') {
  globalAny.RTCPeerConnection = wrtc.RTCPeerConnection;
  globalAny.RTCSessionDescription = wrtc.RTCSessionDescription;
  globalAny.RTCIceCandidate = wrtc.RTCIceCandidate;
}

export async function createWebRtcProvider(ydoc: Y.Doc, planId: string): Promise<WebrtcProvider> {
  /** Build ICE servers configuration */
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  /** Add TURN server if configured */
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
    logger.info({ turnUrl: process.env.TURN_URL }, 'TURN server configured');
  }

  /** Create provider with room name based on plan ID */
  const roomName = `shipyard-${planId}`;
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: [SIGNALING_SERVER],
    peerOpts: {
      // @ts-expect-error - wrtc type definitions don't match runtime structure
      wrtc: wrtc.default || wrtc,
      config: {
        iceServers,
      },
    },
  });

  /*
   * Broadcast MCP identity via awareness protocol and push to signaling
   * Use .catch() to ensure awareness is always set, even if GitHub auth fails
   */
  const username = await getGitHubUsername().catch(() => undefined);
  const fallbackId = `mcp-anon-${crypto.randomUUID().slice(0, 8)}`;
  const userId = username ? `mcp-${username}` : fallbackId;
  const displayName = username ? `Claude Code (${username})` : 'Claude Code';

  const awarenessState: McpAwarenessState = {
    user: {
      id: userId,
      name: displayName,
      color: '#0066cc',
    },
    platform: 'claude-code',
    status: 'approved',
    isOwner: true,
    webrtcPeerId: crypto.randomUUID(),
    context: getEnvironmentContext(),
  };
  provider.awareness.setLocalStateField('planStatus', awarenessState);
  logger.info(
    { planId, username: username ?? fallbackId, platform: 'claude-code', hasContext: true },
    'MCP awareness state set'
  );

  /*
   * Push approval state to signaling server (required for access control)
   * Use fallback ID if no username available
   */
  sendApprovalStateToSignaling(provider, planId, username ?? fallbackId);

  /** Set up event listeners for monitoring */
  setupProviderListeners(provider, planId);

  logger.info(
    {
      planId,
      roomName,
      signaling: SIGNALING_SERVER,
      hasTurn: iceServers.length > 2,
    },
    'WebRTC provider created'
  );

  return provider;
}

/**
 * Push approval state to signaling server.
 * Required for signaling server access control - without this, peers can't communicate.
 *
 * @param provider - The WebRTC provider instance
 * @param planId - The plan ID
 * @param username - The GitHub username (owner)
 */
function sendApprovalStateToSignaling(
  provider: WebrtcProvider,
  planId: string,
  username: string
): void {
  /** Access signaling connections (internal y-webrtc API via shared type guard) */
  const signalingConns = getSignalingConnections(provider);

  if (signalingConns.length === 0) {
    /** Schedule approval state push after signaling connects */
    setTimeout(() => sendApprovalStateToSignaling(provider, planId, username), 1000);
    return;
  }

  /** Send user identity first (so signaling knows which user this connection belongs to) */
  const identifyMessage = JSON.stringify({
    type: 'subscribe',
    topics: [],
    userId: username,
  });

  /** Then send approval state (MCP is owner, so approve itself) */
  const approvalStateMessage = JSON.stringify({
    type: 'approval_state',
    planId,
    ownerId: username,
    approvedUsers: [username],
    rejectedUsers: [],
  });

  for (const conn of signalingConns) {
    // NOTE: SignalingConnection.ws is typed but may be null
    const ws = conn.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(identifyMessage);
      ws.send(approvalStateMessage);
      logger.info({ planId, username }, 'Pushed identity and approval state to signaling server');
    }
  }
}

/**
 * Set up event listeners for WebRTC provider monitoring.
 *
 * @param provider - The WebRTC provider instance
 * @param planId - The plan ID for logging context
 */
function setupProviderListeners(provider: WebrtcProvider, planId: string): void {
  /** Track peer connections */
  provider.on('peers', (event: { added: string[]; removed: string[]; webrtcPeers: string[] }) => {
    const peerCount = event.webrtcPeers.length;

    if (event.added.length > 0) {
      logger.info(
        {
          planId,
          added: event.added,
          totalPeers: peerCount,
        },
        'WebRTC peer connected'
      );
    }

    if (event.removed.length > 0) {
      logger.info(
        {
          planId,
          removed: event.removed,
          totalPeers: peerCount,
        },
        'WebRTC peer disconnected'
      );
    }
  });

  /** Track sync status */
  provider.on('synced', (event: { synced: boolean }) => {
    logger.info(
      {
        planId,
        synced: event.synced,
      },
      'WebRTC sync status changed'
    );
  });

  /** Track signaling connection status */
  provider.on('status', (event: { connected: boolean }) => {
    logger.info(
      {
        planId,
        connected: event.connected,
      },
      'WebRTC signaling status changed'
    );
  });
}

/**
 * Destroy a WebRTC provider and clean up resources.
 *
 * @param provider - The WebRTC provider to destroy
 * @param planId - The plan ID for logging context
 */
export function destroyWebRtcProvider(provider: WebrtcProvider, planId: string): void {
  logger.info({ planId }, 'Destroying WebRTC provider');
  provider.destroy();
}
