/**
 * Hook for sending authentication message after y-webrtc subscribes.
 *
 * Two-message authentication pattern:
 * 1. y-webrtc automatically sends: { type: 'subscribe', topics: [...] }
 * 2. This hook sends: { type: 'authenticate', auth: 'owner'|'invite', ... }
 *
 * SECURITY: Without the authenticate message, the subscription is pending
 * and the connection cannot send or receive any data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import { getSignalingConnections, type SignalingConnection } from '@/types/y-webrtc-internals';
import type { GitHubIdentity } from './useGitHubAuth';

/** Authentication state */
export type AuthenticationState =
  | { status: 'idle' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; userId: string; planId: string }
  | { status: 'error'; error: string };

/** Types for authenticate message */
type AuthenticateOwnerMessage = {
  type: 'authenticate';
  auth: 'owner';
  userId: string;
  githubToken: string;
};

type AuthenticateInviteMessage = {
  type: 'authenticate';
  auth: 'invite';
  userId: string;
  inviteToken: { tokenId: string; tokenValue: string };
};

type AuthenticateMessage = AuthenticateOwnerMessage | AuthenticateInviteMessage;

/** Response types from server */
interface AuthenticatedResponse {
  type: 'authenticated';
  userId: string;
  planId: string;
}

interface AuthErrorResponse {
  type: 'auth_error';
  error: string;
  message: string;
}

/** Props for the hook */
export interface UseAuthenticatedSignalingOptions {
  rtcProvider: WebrtcProvider | null;
  planId: string;
  githubIdentity: GitHubIdentity | null;
  inviteToken: { tokenId: string; tokenValue: string } | null;
}

export interface UseAuthenticatedSignalingReturn {
  authState: AuthenticationState;
  /** Manually retry authentication */
  retryAuth: () => void;
}

/**
 * Build authenticate message from credentials.
 */
function buildAuthMessage(
  githubIdentity: GitHubIdentity | null,
  inviteToken: { tokenId: string; tokenValue: string } | null
): AuthenticateMessage | null {
  if (githubIdentity) {
    return {
      type: 'authenticate',
      auth: 'owner',
      userId: githubIdentity.username,
      githubToken: githubIdentity.token,
    };
  }
  if (inviteToken) {
    return {
      type: 'authenticate',
      auth: 'invite',
      userId: 'anonymous',
      inviteToken,
    };
  }
  return null;
}

/**
 * Add message listeners to all connections.
 */
function addMessageListeners(
  conns: SignalingConnection[],
  handler: (event: MessageEvent) => void
): void {
  for (const conn of conns) {
    conn.ws?.addEventListener('message', handler);
  }
}

/**
 * Remove message listeners from all connections.
 */
function removeMessageListeners(
  conns: SignalingConnection[],
  handler: (event: MessageEvent) => void
): void {
  for (const conn of conns) {
    conn.ws?.removeEventListener('message', handler);
  }
}

/**
 * Find an open connection from the list.
 */
function findOpenConnection(conns: SignalingConnection[]): SignalingConnection | undefined {
  return conns.find((c) => c.ws && c.ws.readyState === WebSocket.OPEN);
}

/**
 * Set up connect listeners on all connections.
 */
function addConnectListeners(conns: SignalingConnection[], handler: () => void): void {
  for (const conn of conns) {
    conn.on?.('connect', handler);
  }
}

/**
 * Remove connect listeners from all connections.
 */
function removeConnectListeners(conns: SignalingConnection[], handler: () => void): void {
  for (const conn of conns) {
    conn.off?.('connect', handler);
  }
}

/**
 * Send authentication message after y-webrtc connects.
 *
 * @param options - Configuration options
 * @returns Authentication state and retry function
 */
export function useAuthenticatedSignaling(
  options: UseAuthenticatedSignalingOptions
): UseAuthenticatedSignalingReturn {
  const { rtcProvider, planId, githubIdentity, inviteToken } = options;

  const [authState, setAuthState] = useState<AuthenticationState>({ status: 'idle' });
  const hasAttemptedRef = useRef(false);

  /** Handle response messages from server */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === 'authenticated') {
        const response = data as AuthenticatedResponse;
        setAuthState({
          status: 'authenticated',
          userId: response.userId,
          planId: response.planId,
        });
      } else if (data.type === 'auth_error') {
        const response = data as AuthErrorResponse;
        setAuthState({
          status: 'error',
          error: response.message || response.error,
        });
      }
    } catch {
      /** Not JSON or not our message - ignore */
    }
  }, []);

  /** Retry authentication */
  const retryAuth = useCallback(() => {
    hasAttemptedRef.current = false;
    setAuthState({ status: 'idle' });
  }, []);

  useEffect(() => {
    if (!rtcProvider || !planId) return;
    if (hasAttemptedRef.current) return;
    if (!githubIdentity && !inviteToken) return;

    const conns = getSignalingConnections(rtcProvider);
    if (conns.length === 0) return;

    /** Build auth message once */
    const authMsg = buildAuthMessage(githubIdentity, inviteToken);
    if (!authMsg) {
      setAuthState({ status: 'error', error: 'No credentials available' });
      return;
    }

    /** Send auth to an open connection */
    const sendAuthToConnection = (conn: SignalingConnection) => {
      if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
        setAuthState({ status: 'authenticating' });
        conn.ws.send(JSON.stringify(authMsg));
      }
    };

    /** Set up message handlers */
    addMessageListeners(conns, handleMessage);

    /** Try to send immediately if connected */
    const openConn = findOpenConnection(conns);
    if (openConn) {
      hasAttemptedRef.current = true;
      sendAuthToConnection(openConn);
      return () => removeMessageListeners(conns, handleMessage);
    }

    /** Wait for connection to open */
    const onConnect = () => {
      if (hasAttemptedRef.current) return;
      const nowOpenConn = findOpenConnection(conns);
      if (nowOpenConn) {
        hasAttemptedRef.current = true;
        sendAuthToConnection(nowOpenConn);
      }
    };

    addConnectListeners(conns, onConnect);

    return () => {
      removeConnectListeners(conns, onConnect);
      removeMessageListeners(conns, handleMessage);
    };
  }, [rtcProvider, planId, githubIdentity, inviteToken, handleMessage]);

  return { authState, retryAuth };
}
