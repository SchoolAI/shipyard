import type { EnvironmentContext, OriginPlatform } from '@shipyard/schema';

/**
 * Approval status for a user in the awareness protocol.
 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Awareness state for a user in a plan.
 * Used for WebRTC awareness protocol to communicate user presence and approval status.
 *
 * This is separate from the Y.Doc metadata (which is the source of truth for approval).
 * Awareness is used for real-time presence and to show pending access requests.
 */
export type PlanAwarenessState =
  | {
      status: 'pending';
      user: {
        id: string;
        name: string;
        color: string;
      };
      isOwner: boolean;
      requestedAt: number;
      /**
       * Platform type for this peer (browser, MCP server, etc.)
       * Used to distinguish between different types of participants.
       */
      platform?: OriginPlatform;
      /**
       * WebRTC peerId (UUID) for P2P transfers.
       * This is different from the awareness clientID (number).
       * The webrtcPeerId is used as the key in room.webrtcConns.
       */
      webrtcPeerId?: string;
      /**
       * Environment context for agent identification.
       * Helps users distinguish agents working from different machines/branches.
       */
      context?: EnvironmentContext;
    }
  | {
      status: 'approved' | 'rejected';
      user: {
        id: string;
        name: string;
        color: string;
      };
      isOwner: boolean;
      /**
       * Platform type for this peer (browser, MCP server, etc.)
       * Used to distinguish between different types of participants.
       */
      platform?: OriginPlatform;
      /**
       * WebRTC peerId (UUID) for P2P transfers.
       * This is different from the awareness clientID (number).
       * The webrtcPeerId is used as the key in room.webrtcConns.
       */
      webrtcPeerId?: string;
      /**
       * Environment context for agent identification.
       * Helps users distinguish agents working from different machines/branches.
       */
      context?: EnvironmentContext;
    };
