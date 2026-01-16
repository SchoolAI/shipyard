import type { OriginPlatform } from '@peer-plan/schema';
import type { WebrtcProvider as WebrtcProviderType } from 'y-webrtc';
import type * as Y from 'yjs';
import { logger } from './logger.js';
import { getGitHubUsername } from './server-identity.js';

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
}

const SIGNALING_SERVER =
  process.env.SIGNALING_URL || 'wss://peer-plan-signaling.jacob-191.workers.dev';

/**
 * Create a WebRTC provider that connects MCP to the peer mesh.
 * This enables direct P2P sync with remote browsers without requiring a localhost browser.
 *
 * @param ydoc - The Yjs document to sync
 * @param planId - The plan ID (used as room name)
 * @returns WebrtcProvider instance
 */
export async function createWebRtcProvider(
  ydoc: Y.Doc,
  planId: string
): Promise<WebrtcProviderType> {
  // Dynamic import to avoid loading wrtc unless WebRTC sync is enabled
  const { WebrtcProvider } = await import('y-webrtc');

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
  const roomName = `peer-plan-${planId}`;
  const provider = new WebrtcProvider(roomName, ydoc, {
    signaling: [SIGNALING_SERVER],
    peerOpts: {
      config: {
        iceServers,
      },
    },
  });

  // Broadcast MCP identity via awareness protocol
  try {
    const username = getGitHubUsername();
    const awarenessState: McpAwarenessState = {
      user: {
        id: `mcp-${username}`,
        name: `Claude Code (${username})`,
        color: '#0066cc',
      },
      platform: 'claude-code',
      status: 'approved',
      isOwner: true,
      webrtcPeerId: crypto.randomUUID(),
    };
    provider.awareness.setLocalStateField('planStatus', awarenessState);
    logger.info({ username, platform: 'claude-code' }, 'MCP awareness state set');
  } catch (error) {
    logger.warn(
      { error },
      'Could not set MCP awareness (GitHub not authenticated - run: gh auth login)'
    );
  }

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
 * Set up event listeners for WebRTC provider monitoring.
 *
 * @param provider - The WebRTC provider instance
 * @param planId - The plan ID for logging context
 */
function setupProviderListeners(provider: WebrtcProviderType, planId: string): void {
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
export function destroyWebRtcProvider(provider: WebrtcProviderType, planId: string): void {
  logger.info({ planId }, 'Destroying WebRTC provider');
  provider.destroy();
}
