import { useEffect, useRef } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { ApprovalStatus } from '@/hooks/useYDocApprovalStatus';
import type { PlanAwarenessState } from '@/types/awareness';
import { getWebrtcPeerId } from '@/types/y-webrtc-internals';

/**
 * Generate a deterministic color from a string (e.g., username).
 * Uses a simple hash to pick a hue for consistent colors per user.
 */
function colorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

interface UseBroadcastApprovalStatusOptions {
  rtcProvider: WebrtcProvider | null;
  githubIdentity: GitHubIdentity | null;
  approvalStatus: ApprovalStatus | undefined;
  isOwner: boolean;
  planId: string;
}

/**
 * Broadcasts the user's approval status to WebRTC awareness.
 *
 * This allows plan owners to see pending users requesting access.
 * The approval status is read from Y.Doc CRDT and broadcast via awareness
 * so other peers (especially the owner) can see who is waiting.
 *
 * Key insight: This was removed in commit a4a6f9d when Milestone 8 was simplified.
 * The usePendingUsers hook depends on awareness.planStatus to detect pending users,
 * but nothing was setting it after the simplification. This hook restores that.
 */
export function useBroadcastApprovalStatus({
  rtcProvider,
  githubIdentity,
  approvalStatus,
  isOwner,
  planId,
}: UseBroadcastApprovalStatusOptions): void {
  /** Store requestedAt timestamp to prevent it from refreshing on re-render */
  const requestedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rtcProvider || !githubIdentity) {
      return;
    }

    /** Validate planId is non-empty */
    if (!planId || planId.trim() === '') {
      return;
    }

    const awareness = rtcProvider.awareness;

    /** Get WebRTC peerId from the room */
    const webrtcPeerId = getWebrtcPeerId(rtcProvider);

    /*
     * Build the awareness state based on approval status
     * Note: platform is omitted for browser users - it's only set by MCP servers
     * useP2PPeers will default to 'browser' when platform is undefined
     */
    const baseState = {
      user: {
        id: githubIdentity.username,
        name: githubIdentity.displayName,
        color: colorFromString(githubIdentity.username),
      },
      isOwner,
      webrtcPeerId,
    };

    let planStatus: PlanAwarenessState;

    if (approvalStatus === 'pending') {
      /** Set requestedAt only once when entering pending state */
      if (requestedAtRef.current === null) {
        requestedAtRef.current = Date.now();
      }

      planStatus = {
        ...baseState,
        status: 'pending',
        requestedAt: requestedAtRef.current,
        planId,
        expiresAt: requestedAtRef.current + 24 * 60 * 60 * 1000,
      };
    } else if (approvalStatus === 'approved' || approvalStatus === 'rejected') {
      /** Clear requestedAt when leaving pending state */
      requestedAtRef.current = null;

      planStatus = {
        ...baseState,
        status: approvalStatus,
        planId,
      };
    } else {
      /** Clear requestedAt for other states */
      requestedAtRef.current = null;
      /** No approval required - don't broadcast planStatus */
      return;
    }

    /** Broadcast to awareness */
    awareness.setLocalStateField('planStatus', planStatus);

    /** Cleanup: Clear planStatus when component unmounts */
    return () => {
      /*
       * Note: If browser closes ungracefully (force quit), awareness state
       * persists until WebRTC timeout (~30 seconds). This is expected behavior.
       * The beforeunload handler in useMultiProviderSync sets localState to null,
       * which also clears planStatus. The 24-hour expiration provides secondary cleanup.
       */
      if (awareness.getLocalState()?.planStatus) {
        awareness.setLocalStateField('planStatus', null);
      }
    };
  }, [rtcProvider, githubIdentity, approvalStatus, isOwner, planId]);
}
