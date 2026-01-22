import wrtc from '@roamhq/wrtc';
import type { EnvironmentContext, OriginPlatform } from '@shipyard/schema';
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
 * Production signaling when NODE_ENV=production, localhost for development.
 * NODE_ENV is set in .mcp-plugin.json (production) or .mcp.json (development).
 */
const defaultSignaling =
  process.env.NODE_ENV === 'production'
    ? 'wss://shipyard-signaling.jacob-191.workers.dev'
    : 'ws://localhost:4444';
const SIGNALING_SERVER = process.env.SIGNALING_URL || defaultSignaling;

/**
 * Create a WebRTC provider that connects MCP to the peer mesh.
 * This enables direct P2P sync with remote browsers without requiring a localhost browser.
 *
 * @param ydoc - The Yjs document to sync
 * @param planId - The plan ID (used as room name)
 * @returns WebrtcProvider instance
 */
// Polyfill global WebRTC objects for simple-peer (done once at module load)
// @ts-expect-error - Checking for browser WebRTC API availability
if (typeof globalThis.RTCPeerConnection === 'undefined') {
  // @ts-expect-error - Polyfilling browser WebRTC APIs for Node.js
  globalThis.RTCPeerConnection = wrtc.RTCPeerConnection;
  // @ts-expect-error - Polyfilling browser WebRTC APIs for Node.js
  globalThis.RTCSessionDescription = wrtc.RTCSessionDescription;
  // @ts-expect-error - Polyfilling browser WebRTC APIs for Node.js
  globalThis.RTCIceCandidate = wrtc.RTCIceCandidate;
}

export async function createWebRtcProvider(ydoc: Y.Doc, planId: string): Promise<WebrtcProvider> {
  // Build ICE servers configuration
  const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Add TURN server if configured
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
    logger.info({ turnUrl: process.env.TURN_URL }, 'TURN server configured');
  }

  // Create provider with room name based on plan ID
  const roomName = `shipyard-${planId}`;
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: [SIGNALING_SERVER],
    peerOpts: {
      // @ts-expect-error - wrtc type definitions don't match runtime structure
      wrtc: wrtc.default || wrtc, // Pass wrtc polyfill to simple-peer
      config: {
        iceServers,
      },
    },
  });

  // Broadcast MCP identity via awareness protocol and push to signaling
  // Use .catch() to ensure awareness is always set, even if GitHub auth fails
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

  // Push approval state to signaling server (required for access control)
  // Use fallback ID if no username available
  sendApprovalStateToSignaling(provider, planId, username ?? fallbackId);

  // Set up event listeners for monitoring
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
  // Access signaling connections (internal y-webrtc API)
  const signalingConns = (provider as unknown as { signalingConns?: Array<{ ws?: unknown }> })
    .signalingConns;

  if (!signalingConns || signalingConns.length === 0) {
    // Schedule approval state push after signaling connects
    setTimeout(() => sendApprovalStateToSignaling(provider, planId, username), 1000);
    return;
  }

  // Send user identity first (so signaling knows which user this connection belongs to)
  const identifyMessage = JSON.stringify({
    type: 'subscribe',
    topics: [], // Empty topics - just identifying the user
    userId: username,
  });

  // Then send approval state (MCP is owner, so approve itself)
  const approvalStateMessage = JSON.stringify({
    type: 'approval_state',
    planId,
    ownerId: username,
    approvedUsers: [username], // Owner is always approved
    rejectedUsers: [],
  });

  for (const conn of signalingConns) {
    // Type assertion for internal y-webrtc WebSocket connection
    const ws = conn.ws as { readyState?: number; send?: (data: string) => void } | undefined;
    if (ws?.readyState === 1) {
      // WebSocket.OPEN = 1
      ws.send?.(identifyMessage);
      ws.send?.(approvalStateMessage);
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
  // Track peer connections
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

  // Track sync status
  provider.on('synced', (event: { synced: boolean }) => {
    logger.info(
      {
        planId,
        synced: event.synced,
      },
      'WebRTC sync status changed'
    );
  });

  // Track signaling connection status
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
