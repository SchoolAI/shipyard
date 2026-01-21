import { useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import type { PlanAwarenessState } from '@/types/awareness';

export interface PendingUser {
  /** GitHub username */
  id: string;
  /** Display name */
  name: string;
  /** Generated color for the user */
  color: string;
  /** When they first requested access */
  requestedAt: number;
}

/**
 * Hook to extract pending users from WebRTC awareness state.
 * Only returns users who are in 'pending' status and not the owner.
 *
 * @param rtcProvider - WebRTC provider with awareness state
 * @returns Array of pending users
 */
export function usePendingUsers(rtcProvider: WebrtcProvider | null): PendingUser[] {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);

  useEffect(() => {
    if (!rtcProvider) {
      setPendingUsers([]);
      return;
    }

    const awareness = rtcProvider.awareness;

    const updatePendingUsers = () => {
      const states = awareness.getStates();
      const pending: PendingUser[] = [];

      for (const [, state] of states) {
        const planStatus = state.planStatus as PlanAwarenessState | undefined;

        // Skip if no plan status or not pending
        if (!planStatus || planStatus.status !== 'pending') {
          continue;
        }

        // Skip owners (they're always approved)
        if (planStatus.isOwner) {
          continue;
        }

        pending.push({
          id: planStatus.user.id,
          name: planStatus.user.name,
          color: planStatus.user.color,
          requestedAt: planStatus.requestedAt,
        });
      }

      // Sort by request time (oldest first)
      pending.sort((a, b) => a.requestedAt - b.requestedAt);

      // Deduplicate by user id (same user could have multiple browser tabs)
      const seen = new Set<string>();
      const deduplicated = pending.filter((user) => {
        if (seen.has(user.id)) {
          return false;
        }
        seen.add(user.id);
        return true;
      });

      setPendingUsers(deduplicated);
    };

    // Initial update
    updatePendingUsers();

    // Listen for awareness changes
    awareness.on('change', updatePendingUsers);

    return () => {
      awareness.off('change', updatePendingUsers);
    };
  }, [rtcProvider]);

  return pendingUsers;
}
