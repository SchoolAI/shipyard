import { useEffect, useState } from 'react';
import type { WebrtcProvider } from 'y-webrtc';
import { isPlanAwarenessState, type PlanAwarenessState } from '@/types/awareness';

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
 * @param currentPlanId - Current plan ID to filter pending users
 * @returns Array of pending users
 */
export function usePendingUsers(
  rtcProvider: WebrtcProvider | null,
  currentPlanId: string
): PendingUser[] {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);

  useEffect(() => {
    if (!rtcProvider) {
      setPendingUsers([]);
      return;
    }

    const awareness = rtcProvider.awareness;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: filtering logic requires multiple conditions
    const updatePendingUsers = () => {
      const states = awareness.getStates();
      const pending: PendingUser[] = [];
      const now = Date.now();

      for (const [, state] of states) {
        const stateRecord =
          state && typeof state === 'object' ? Object.fromEntries(Object.entries(state)) : {};
        const planStatusRaw = stateRecord.planStatus;
        const planStatus: PlanAwarenessState | undefined = isPlanAwarenessState(planStatusRaw)
          ? planStatusRaw
          : undefined;

        // Skip if no plan status or not pending
        if (!planStatus || planStatus.status !== 'pending') {
          continue;
        }

        // Runtime validation for malicious/malformed data
        // Check that user object and required fields exist
        if (!planStatus.user || typeof planStatus.user !== 'object') {
          continue;
        }

        if (!planStatus.user.id || typeof planStatus.user.id !== 'string') {
          continue;
        }

        if (!planStatus.user.name || typeof planStatus.user.name !== 'string') {
          continue;
        }

        // Validate requestedAt is a valid timestamp
        if (typeof planStatus.requestedAt !== 'number' || Number.isNaN(planStatus.requestedAt)) {
          continue;
        }

        // Skip owners (they're always approved)
        if (planStatus.isOwner) {
          continue;
        }

        // Filter by planId (reject empty planIds)
        if (!planStatus.planId || planStatus.planId !== currentPlanId) {
          continue;
        }

        // Filter expired requests
        // Note: This check uses Date.now() which can be manipulated by changing
        // system clock. However, this is acceptable because:
        // 1. Awareness expiration is advisory only (cosmetic)
        // 2. Actual approval is enforced by Y.Doc CRDT (immutable source of truth)
        // 3. Malicious users can only affect their own visibility, not access
        if (planStatus.expiresAt && planStatus.expiresAt < now) {
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
  }, [rtcProvider, currentPlanId]);

  return pendingUsers;
}
