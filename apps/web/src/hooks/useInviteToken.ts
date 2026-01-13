import { type InviteRedemptionResult, parseInviteFromUrl } from '@peer-plan/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { WebrtcProvider } from 'y-webrtc';
import type { GitHubIdentity } from './useGitHubAuth';

export type RedemptionState =
  | { status: 'idle' }
  | { status: 'has_invite' }
  | { status: 'waiting_for_auth' }
  | { status: 'redeeming' }
  | { status: 'success' }
  | { status: 'error'; error: InviteRedemptionResult['error'] };

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
        if (data.type === 'invite_redemption_result') {
          const result = data as InviteRedemptionResult;
          if (result.success) {
            setRedemptionState({ status: 'success' });
            // Clean up URL after short delay to show success state
            setTimeout(() => {
              clearInviteToken();
            }, 500);
          } else {
            setRedemptionState({ status: 'error', error: result.error });
          }
        }
      } catch {
        // Not JSON or not our message
      }
    };

    // Access signaling connections from WebRTC provider
    const signalingConns = (rtcProvider as unknown as { signalingConns: Array<{ ws: WebSocket }> })
      .signalingConns;

    if (signalingConns) {
      for (const conn of signalingConns) {
        if (conn.ws) {
          conn.ws.addEventListener('message', handleMessage);
        }
      }
    }

    return () => {
      if (signalingConns) {
        for (const conn of signalingConns) {
          if (conn.ws) {
            conn.ws.removeEventListener('message', handleMessage);
          }
        }
      }
    };
  }, [rtcProvider, clearInviteToken]);

  // Redeem invite token
  const redeemInvite = useCallback(() => {
    const invite = inviteRef.current;

    // Validate state
    if (!invite || !githubIdentity || !rtcProvider) {
      return;
    }

    if (hasAttemptedRef.current) {
      return;
    }

    setRedemptionState({ status: 'redeeming' });
    hasAttemptedRef.current = true;

    // Build redeem message
    const redeemMessage = JSON.stringify({
      type: 'redeem_invite',
      planId,
      tokenId: invite.tokenId,
      tokenValue: invite.tokenValue,
      userId: githubIdentity.username,
    });

    // Send to all signaling connections
    const signalingConns = (rtcProvider as unknown as { signalingConns: Array<{ ws: WebSocket }> })
      .signalingConns;

    let sent = false;
    if (signalingConns) {
      for (const conn of signalingConns) {
        if (conn.ws && conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(redeemMessage);
          sent = true;
        }
      }
    }

    if (!sent) {
      setRedemptionState({ status: 'error', error: 'invalid' });
      hasAttemptedRef.current = false;
    }
  }, [planId, githubIdentity, rtcProvider]);

  // Auto-redeem when conditions are met
  useEffect(() => {
    if (
      hasInviteToken &&
      githubIdentity &&
      rtcProvider &&
      !hasAttemptedRef.current &&
      (redemptionState.status === 'has_invite' || redemptionState.status === 'waiting_for_auth')
    ) {
      // Check if signaling is connected before attempting
      const signalingConns = (
        rtcProvider as unknown as { signalingConns: Array<{ ws: WebSocket }> }
      ).signalingConns;

      const hasOpenConnection = signalingConns?.some(
        (conn) => conn.ws && conn.ws.readyState === WebSocket.OPEN
      );

      if (hasOpenConnection) {
        redeemInvite();
      }
    }
  }, [hasInviteToken, githubIdentity, rtcProvider, redemptionState.status, redeemInvite]);

  return {
    redemptionState,
    hasInviteToken,
    redeemInvite,
    clearInviteToken,
  };
}
