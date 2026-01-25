import { type InviteRedemptionResult, parseInviteFromUrl } from '@shipyard/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { WebrtcProvider } from 'y-webrtc';
import { getSignalingConnections, type SignalingConnection } from '@/types/y-webrtc-internals';
import type { GitHubIdentity } from './useGitHubAuth';

export type RedemptionState =
  | { status: 'idle' }
  | { status: 'has_invite' }
  | { status: 'waiting_for_auth' }
  | { status: 'redeeming' }
  | { status: 'success' }
  | { status: 'error'; error: Extract<InviteRedemptionResult, { success: false }>['error'] };

type InviteErrorType = Extract<InviteRedemptionResult, { success: false }>['error'];

function isValidInviteError(value: string): value is InviteErrorType {
  return (
    value === 'expired' ||
    value === 'exhausted' ||
    value === 'revoked' ||
    value === 'invalid' ||
    value === 'already_redeemed'
  );
}

export interface UseInviteTokenReturn {
  /** Current redemption state */
  redemptionState: RedemptionState;
  /** Whether URL has an invite token */
  hasInviteToken: boolean;
  /** Attempt to redeem the invite token */
  redeemInvite: () => void;
  /** Clear the invite token from URL without redeeming */
  clearInviteToken: () => void;
}

/**
 * Hook to handle invite token redemption from URL.
 *
 * Flow:
 * 1. Parse ?invite param from URL
 * 2. When user authenticates + rtcProvider connects, send redeem_invite
 * 3. Handle response and update state
 * 4. Clean up URL on success
 */
export function useInviteToken(
  planId: string,
  rtcProvider: WebrtcProvider | null,
  githubIdentity: GitHubIdentity | null
): UseInviteTokenReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [redemptionState, setRedemptionState] = useState<RedemptionState>({ status: 'idle' });

  // Track if we've already attempted redemption to prevent double-redeem
  const hasAttemptedRef = useRef(false);
  // Store parsed invite to avoid re-parsing
  const inviteRef = useRef<{ tokenId: string; tokenValue: string } | null>(null);

  // Parse invite from URL on mount or when URL changes
  const inviteParam = searchParams.get('invite');
  const hasInviteToken = inviteParam !== null;

  // Parse and cache invite token
  useEffect(() => {
    if (inviteParam) {
      const invite = parseInviteFromUrl(window.location.href);
      inviteRef.current = invite;

      if (invite) {
        if (githubIdentity) {
          setRedemptionState({ status: 'has_invite' });
        } else {
          setRedemptionState({ status: 'waiting_for_auth' });
        }
      }
    } else {
      inviteRef.current = null;
      // Don't reset state if we already succeeded
      if (redemptionState.status !== 'success') {
        setRedemptionState({ status: 'idle' });
      }
    }
  }, [inviteParam, githubIdentity, redemptionState.status]);

  // Clear invite token from URL
  const clearInviteToken = useCallback(() => {
    if (searchParams.has('invite')) {
      searchParams.delete('invite');
      setSearchParams(searchParams, { replace: true });
    }
    inviteRef.current = null;
    hasAttemptedRef.current = false;
  }, [searchParams, setSearchParams]);

  // Listen for redemption result from signaling server
  useEffect(() => {
    if (!rtcProvider) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'invite_redemption_result') return;

        if (data.success === true && typeof data.planId === 'string') {
          // Success variant
          setRedemptionState({ status: 'success' });
          // Clean up URL after short delay to show success state
          setTimeout(() => {
            clearInviteToken();
          }, 500);
        } else if (data.success === false && isValidInviteError(data.error)) {
          // Failure variant
          setRedemptionState({ status: 'error', error: data.error });
        }
      } catch {
        // Not JSON or not our message
      }
    };

    // Access signaling connections from WebRTC provider
    const signalingConns = getSignalingConnections(rtcProvider);

    for (const conn of signalingConns) {
      if (conn.ws) {
        conn.ws.addEventListener('message', handleMessage);
      }
    }

    return () => {
      for (const conn of signalingConns) {
        if (conn.ws) {
          conn.ws.removeEventListener('message', handleMessage);
        }
      }
    };
  }, [rtcProvider, clearInviteToken]);

  // Helper to send message to signaling server
  const sendToSignaling = useCallback(
    (message: string): boolean => {
      if (!rtcProvider) return false;

      const signalingConns = getSignalingConnections(rtcProvider);

      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(message);
          return true;
        }
      }
      return false;
    },
    [rtcProvider]
  );

  // Redeem invite token
  const redeemInvite = useCallback(() => {
    const invite = inviteRef.current;

    // Early returns for validation
    if (!invite || !githubIdentity) return;
    if (hasAttemptedRef.current) return;

    setRedemptionState({ status: 'redeeming' });
    hasAttemptedRef.current = true;

    // Build and send redeem message
    const redeemMessage = JSON.stringify({
      type: 'redeem_invite',
      planId,
      tokenId: invite.tokenId,
      tokenValue: invite.tokenValue,
      userId: githubIdentity.username,
    });

    const sent = sendToSignaling(redeemMessage);
    if (!sent) {
      const errorState: RedemptionState = { status: 'error', error: 'invalid' };
      setRedemptionState(errorState);
      hasAttemptedRef.current = false;
    }
  }, [planId, githubIdentity, sendToSignaling]);

  // Auto-redeem when conditions are met
  // Uses event-based approach instead of polling for signaling connection
  useEffect(() => {
    if (
      !hasInviteToken ||
      !githubIdentity ||
      !rtcProvider ||
      hasAttemptedRef.current ||
      (redemptionState.status !== 'has_invite' && redemptionState.status !== 'waiting_for_auth')
    ) {
      return;
    }

    const signalingConns = getSignalingConnections(rtcProvider);

    if (signalingConns.length === 0) return;

    const hasOpenConnection = signalingConns.some(
      (conn) => conn.ws && conn.ws.readyState === WebSocket.OPEN
    );

    if (hasOpenConnection) {
      redeemInvite();
      return;
    }

    // Listen for 'connect' event instead of polling
    const handlers: Array<{ conn: SignalingConnection; handler: () => void }> = [];

    const onConnect = () => {
      if (!hasAttemptedRef.current) {
        redeemInvite();
      }
      // Clean up all handlers after first connection
      for (const { conn, handler } of handlers) {
        conn.off?.('connect', handler);
      }
    };

    for (const conn of signalingConns) {
      conn.on?.('connect', onConnect);
      handlers.push({ conn, handler: onConnect });
    }

    return () => {
      for (const { conn, handler } of handlers) {
        conn.off?.('connect', handler);
      }
    };
  }, [hasInviteToken, githubIdentity, rtcProvider, redemptionState.status, redeemInvite]);

  return {
    redemptionState,
    hasInviteToken,
    redeemInvite,
    clearInviteToken,
  };
}
