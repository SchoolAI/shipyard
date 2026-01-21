import { useEffect } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { GitHubIdentity } from '@/hooks/useGitHubAuth';
import type { ApprovalStatus } from '@/hooks/useYDocApprovalStatus';
import type { PlanAwarenessState } from '@/types/awareness';

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
}: UseBroadcastApprovalStatusOptions): void {
  useEffect(() => {
    if (!rtcProvider || !githubIdentity) {
      return;
    }

    const awareness = rtcProvider.awareness;

    // Get WebRTC peerId from the room
    const webrtcPeerId = (rtcProvider as unknown as { room?: { peerId?: string } }).room?.peerId;

    // Build the awareness state based on approval status
    // Note: 'platform' is omitted for browser users - it's only set by MCP servers
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
      planStatus = {
        ...baseState,
        status: 'pending',
        requestedAt: Date.now(),
      };
    } else if (approvalStatus === 'approved' || approvalStatus === 'rejected') {
      planStatus = {
        ...baseState,
        status: approvalStatus,
      };
    } else {
      // No approval required - don't broadcast planStatus
      return;
    }

    // Broadcast to awareness
    awareness.setLocalStateField('planStatus', planStatus);

    // Cleanup: Clear planStatus when component unmounts
    return () => {
      // Only clear if we actually set it
      if (awareness.getLocalState()?.planStatus) {
        awareness.setLocalStateField('planStatus', null);
      }
    };
  }, [rtcProvider, githubIdentity, approvalStatus, isOwner]);
}
