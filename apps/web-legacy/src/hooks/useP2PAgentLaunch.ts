/**
 * useP2PAgentLaunch - React hook for P2P agent launching
 *
 * This hook enables browsers without a local daemon to launch agents
 * by forwarding requests to connected peers that have daemon access.
 *
 * Features:
 * - Launch agents via peers with daemon (for mobile browsers)
 * - Handle launch requests from other peers (for desktop with daemon)
 * - Track peers with daemon access
 * - Automatic peer connection management
 *
 * @see Issue #218 - A2A for Daemon (P2P Agent Launching)
 */

import type { AgentLaunchRequest, AgentLaunchResponse } from '@shipyard/schema';
import {
  type A2AMessage,
  type ConversationExportMeta,
  ConversationExportMetaSchema,
  validateA2AMessages,
} from '@shipyard/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import { getWebrtcRoom } from '@/types/y-webrtc-internals';
import {
  P2PAgentLaunchManager,
  type P2PAgentLaunchOptions,
  type P2PAgentLaunchResult,
  type PeerConnection,
} from '../utils/P2PAgentLaunchManager';
import type { ConnectedPeer } from './useP2PPeers';

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

/**
 * Options for the hook.
 */
interface UseP2PAgentLaunchOptions {
  /** WebRTC provider for P2P connections */
  rtcProvider: WebrtcProvider | null;
  /** Connected peers with their status */
  connectedPeers: ConnectedPeer[];
  /** Whether this browser has a local daemon connection */
  hasDaemon: boolean;
  /** Handler for starting agents locally (if hasDaemon is true) */
  startAgentLocally?: (taskId: string, prompt: string, cwd?: string) => void;
  /** Handler for starting agents with context locally (if hasDaemon is true) */
  startAgentWithContextLocally?: (
    taskId: string,
    a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta },
    cwd?: string
  ) => void;
  /** Callback when agent starts successfully (from local or P2P) */
  onAgentStarted?: (taskId: string, pid: number, sessionId?: string) => void;
}

/**
 * Return type for the hook.
 */
interface UseP2PAgentLaunchReturn {
  /** Peers that have daemon access and can launch agents */
  peersWithDaemon: ConnectedPeer[];
  /** Whether P2P agent launching is available (has peers with daemon) */
  canLaunchViaP2P: boolean;
  /** Launch an agent via a specific peer */
  launchViaP2P: (peerId: string, options: P2PAgentLaunchOptions) => Promise<P2PAgentLaunchResult>;
  /** Whether a P2P launch is currently in progress */
  isLaunching: boolean;
  /** Last launch result */
  lastResult: P2PAgentLaunchResult | null;
  /** Complete a pending local launch (called by daemon hook when agent starts/fails) */
  completePendingLocalLaunch: (
    taskId: string,
    success: boolean,
    pid?: number,
    sessionId?: string,
    error?: string
  ) => void;
}

/*
 * =============================================================================
 * Helper Functions
 * =============================================================================
 */

/**
 * Extracts peer connections from a WebRTC provider.
 */
function extractPeersFromProvider(provider: WebrtcProvider | null): Map<string, PeerConnection> {
  const peers = new Map<string, PeerConnection>();

  if (!provider) return peers;

  const room = getWebrtcRoom<PeerConnection>(provider);

  if (!room || !room.webrtcConns) return peers;

  for (const [peerId, conn] of room.webrtcConns) {
    if (conn.peer) {
      peers.set(peerId, conn.peer);
    }
  }

  return peers;
}

/**
 * Creates an error response for an agent launch request.
 */
function createErrorResponse(
  requestId: string,
  taskId: string,
  error: string
): AgentLaunchResponse {
  return {
    requestId,
    success: false,
    taskId,
    error,
    sentAt: Date.now(),
  };
}

/**
 * Validates A2A payload messages and meta.
 * Returns validated data or an error message.
 */
function validateA2APayload(
  a2aPayload: NonNullable<AgentLaunchRequest['a2aPayload']>
):
  | { valid: true; messages: A2AMessage[]; meta: ConversationExportMeta }
  | { valid: false; error: string } {
  const { valid: validMessages, errors: messageErrors } = validateA2AMessages(a2aPayload.messages);
  if (messageErrors.length > 0 || validMessages.length === 0) {
    const errorMsg = messageErrors.map((e) => e.error).join(', ') || 'no valid messages';
    return { valid: false, error: `Invalid A2A messages: ${errorMsg}` };
  }

  const metaResult = ConversationExportMetaSchema.safeParse(a2aPayload.meta);
  if (!metaResult.success) {
    return { valid: false, error: `Invalid meta: ${metaResult.error.message}` };
  }

  return { valid: true, messages: validMessages, meta: metaResult.data };
}

/**
 * Context for handling agent launch requests.
 */
interface RequestHandlerContext {
  pendingLocalLaunches: Map<string, (response: AgentLaunchResponse) => void>;
  startAgentLocally: (taskId: string, prompt: string, cwd?: string) => void;
  startAgentWithContextLocally: (
    taskId: string,
    a2aPayload: { messages: A2AMessage[]; meta: ConversationExportMeta },
    cwd?: string
  ) => void;
}

/**
 * Creates a request handler for processing agent launch requests.
 */
function createRequestHandler(
  ctx: RequestHandlerContext
): (request: AgentLaunchRequest) => Promise<AgentLaunchResponse> {
  return (request: AgentLaunchRequest): Promise<AgentLaunchResponse> => {
    return new Promise((resolve) => {
      ctx.pendingLocalLaunches.set(request.requestId, resolve);

      const timeoutId = setTimeout(() => {
        if (ctx.pendingLocalLaunches.has(request.requestId)) {
          ctx.pendingLocalLaunches.delete(request.requestId);
          resolve(
            createErrorResponse(
              request.requestId,
              request.taskId,
              'Local daemon did not respond in time'
            )
          );
        }
      }, 30_000);

      const resolveWithError = (error: string): void => {
        clearTimeout(timeoutId);
        ctx.pendingLocalLaunches.delete(request.requestId);
        resolve(createErrorResponse(request.requestId, request.taskId, error));
      };

      if (request.a2aPayload) {
        const validationResult = validateA2APayload(request.a2aPayload);
        if (!validationResult.valid) {
          resolveWithError(validationResult.error);
          return;
        }
        ctx.startAgentWithContextLocally(
          request.taskId,
          { messages: validationResult.messages, meta: validationResult.meta },
          request.cwd
        );
      } else if (request.prompt) {
        ctx.startAgentLocally(request.taskId, request.prompt, request.cwd);
      } else {
        resolveWithError('No prompt or a2aPayload provided');
      }
    });
  };
}

/*
 * =============================================================================
 * Hook Implementation
 * =============================================================================
 */

/**
 * Hook for P2P agent launching.
 *
 * @param options - Hook configuration
 * @returns Object with P2P launch capabilities
 */
export function useP2PAgentLaunch({
  rtcProvider,
  connectedPeers,
  hasDaemon,
  startAgentLocally,
  startAgentWithContextLocally,
  onAgentStarted,
}: UseP2PAgentLaunchOptions): UseP2PAgentLaunchReturn {
  const [isLaunching, setIsLaunching] = useState(false);
  const [lastResult, setLastResult] = useState<P2PAgentLaunchResult | null>(null);

  /** Manager ref for P2P agent launching */
  const managerRef = useRef<P2PAgentLaunchManager | null>(null);
  /** Track peers we've added to the manager */
  const trackedPeersRef = useRef<Map<string, PeerConnection>>(new Map());
  /** Store pending local launches waiting for daemon response */
  const pendingLocalLaunchesRef = useRef<Map<string, (response: AgentLaunchResponse) => void>>(
    new Map()
  );

  /** Filter peers that have daemon access */
  const peersWithDaemon = useMemo(
    () => connectedPeers.filter((peer) => peer.hasDaemon && peer.webrtcPeerId),
    [connectedPeers]
  );

  /** Initialize and manage P2P agent launch manager */
  useEffect(() => {
    if (!rtcProvider) {
      return;
    }

    const peers = extractPeersFromProvider(rtcProvider);
    trackedPeersRef.current = peers;

    const manager = new P2PAgentLaunchManager(peers);
    managerRef.current = manager;

    /**
     * Set up request handler if this peer has daemon.
     * This allows other peers to launch agents via this peer.
     */
    if (hasDaemon && startAgentLocally && startAgentWithContextLocally) {
      manager.setRequestHandler(
        createRequestHandler({
          pendingLocalLaunches: pendingLocalLaunchesRef.current,
          startAgentLocally,
          startAgentWithContextLocally,
        })
      );
    }

    /** Update peer list when peers change */
    const updatePeerList = (): void => {
      const currentPeers = extractPeersFromProvider(rtcProvider);

      /** Add new peers to manager */
      for (const [peerId, peer] of currentPeers) {
        if (!trackedPeersRef.current.has(peerId)) {
          manager.addPeer(peerId, peer);
          trackedPeersRef.current.set(peerId, peer);
        }
      }

      /** Remove disconnected peers */
      for (const peerId of trackedPeersRef.current.keys()) {
        if (!currentPeers.has(peerId)) {
          manager.removePeer(peerId);
          trackedPeersRef.current.delete(peerId);
        }
      }
    };

    /** Listen for peer changes */
    const handlePeersChange = (): void => {
      updatePeerList();
    };

    rtcProvider.on('peers', handlePeersChange);

    /** Poll for changes to catch race conditions */
    const pollInterval = setInterval(updatePeerList, 2000);

    return () => {
      rtcProvider.off('peers', handlePeersChange);
      clearInterval(pollInterval);
      manager.dispose();
      managerRef.current = null;
      trackedPeersRef.current.clear();
      pendingLocalLaunchesRef.current.clear();
    };
  }, [rtcProvider, hasDaemon, startAgentLocally, startAgentWithContextLocally]);

  /**
   * Complete a pending local launch.
   * Called from daemon message handler when agent starts or fails.
   */
  const completePendingLocalLaunch = useCallback(
    (taskId: string, success: boolean, pid?: number, sessionId?: string, error?: string) => {
      /** Find pending request by taskId */
      for (const [requestId, resolve] of pendingLocalLaunchesRef.current) {
        const response: AgentLaunchResponse = {
          requestId,
          success,
          taskId,
          pid,
          sessionId,
          error,
          sentAt: Date.now(),
        };
        resolve(response);
        pendingLocalLaunchesRef.current.delete(requestId);

        if (success && pid !== undefined) {
          onAgentStarted?.(taskId, pid, sessionId);
        }
        break;
      }
    },
    [onAgentStarted]
  );

  /**
   * Launch an agent via a P2P peer.
   */
  const launchViaP2P = useCallback(
    async (peerId: string, options: P2PAgentLaunchOptions): Promise<P2PAgentLaunchResult> => {
      const manager = managerRef.current;
      if (!manager) {
        const result: P2PAgentLaunchResult = {
          success: false,
          taskId: options.taskId,
          error: 'P2P manager not initialized',
        };
        setLastResult(result);
        return result;
      }

      setIsLaunching(true);
      setLastResult(null);

      try {
        const result = await manager.launchViaP2P(peerId, options);
        setLastResult(result);

        if (result.success) {
          onAgentStarted?.(result.taskId, result.pid, result.sessionId);
        }

        return result;
      } finally {
        setIsLaunching(false);
      }
    },
    [onAgentStarted]
  );

  return {
    peersWithDaemon,
    canLaunchViaP2P: peersWithDaemon.length > 0,
    launchViaP2P,
    isLaunching,
    lastResult,
    /** Complete a pending local launch (called by daemon hook when agent starts/fails) */
    completePendingLocalLaunch,
  };
}

/**
 * Export completePendingLocalLaunch for use by daemon hook.
 * This is a workaround since we can't easily share state between hooks.
 * The daemon hook should call this when an agent starts or fails.
 */
export function createLocalLaunchCompleter() {
  const pendingLaunches = new Map<
    string,
    {
      resolve: (response: AgentLaunchResponse) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  return {
    /**
     * Register a pending launch that's waiting for daemon response.
     */
    registerPending(requestId: string, taskId: string): Promise<AgentLaunchResponse> {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          if (pendingLaunches.has(requestId)) {
            pendingLaunches.delete(requestId);
            resolve({
              requestId,
              success: false,
              taskId,
              error: 'Daemon did not respond in time',
              sentAt: Date.now(),
            });
          }
        }, 30_000);

        pendingLaunches.set(requestId, { resolve, timeoutId });
      });
    },

    /**
     * Complete a pending launch when daemon responds.
     */
    complete(
      taskId: string,
      success: boolean,
      pid?: number,
      sessionId?: string,
      error?: string
    ): boolean {
      for (const [requestId, { resolve, timeoutId }] of pendingLaunches) {
        clearTimeout(timeoutId);
        pendingLaunches.delete(requestId);
        resolve({
          requestId,
          success,
          taskId,
          pid,
          sessionId,
          error,
          sentAt: Date.now(),
        });
        return true;
      }
      return false;
    },

    /**
     * Clean up all pending launches.
     */
    dispose(): void {
      for (const [requestId, { resolve, timeoutId }] of pendingLaunches) {
        clearTimeout(timeoutId);
        resolve({
          requestId,
          success: false,
          taskId: '',
          error: 'Disposed',
          sentAt: Date.now(),
        });
      }
      pendingLaunches.clear();
    },
  };
}
