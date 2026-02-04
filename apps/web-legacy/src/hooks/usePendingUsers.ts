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
 * Narrowed type for pending awareness state.
 */
type PendingAwarenessState = Extract<PlanAwarenessState, { status: 'pending' }>;

/**
 * Validate that a pending PlanAwarenessState has all required user fields.
 * Returns false for malicious/malformed data.
 */
function hasValidUserData(planStatus: PendingAwarenessState): boolean {
  /** Check that user object and required fields exist */
  if (!planStatus.user || typeof planStatus.user !== 'object') {
    return false;
  }

  if (!planStatus.user.id || typeof planStatus.user.id !== 'string') {
    return false;
  }

  if (!planStatus.user.name || typeof planStatus.user.name !== 'string') {
    return false;
  }

  /** Validate requestedAt is a valid timestamp */
  if (typeof planStatus.requestedAt !== 'number' || Number.isNaN(planStatus.requestedAt)) {
    return false;
  }

  return true;
}

/**
 * Check if a pending plan status should be included as a pending user.
 */
function isPendingForPlan(
  planStatus: PendingAwarenessState,
  currentPlanId: string,
  now: number
): boolean {
  /** Skip owners (they're always approved) */
  if (planStatus.isOwner) {
    return false;
  }

  /** Filter by planId (reject empty planIds) */
  if (!planStatus.planId || planStatus.planId !== currentPlanId) {
    return false;
  }

  /*
   * Filter expired requests
   * Note: This check uses Date.now() which can be manipulated by changing
   * system clock. However, this is acceptable because:
   * 1. Awareness expiration is advisory only (cosmetic)
   * 2. Actual approval is enforced by Y.Doc CRDT (immutable source of truth)
   * 3. Malicious users can only affect their own visibility, not access
   */
  if (planStatus.expiresAt && planStatus.expiresAt < now) {
    return false;
  }

  return true;
}

/**
 * Deduplicate users by id (same user could have multiple browser tabs).
 */
function deduplicateUsers(users: PendingUser[]): PendingUser[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) {
      return false;
    }
    seen.add(user.id);
    return true;
  });
}

/**
 * Extract plan status from an awareness state entry.
 */
function extractPendingStatus(state: unknown): PendingAwarenessState | null {
  const stateRecord =
    state && typeof state === 'object' ? Object.fromEntries(Object.entries(state)) : {};
  const planStatusRaw = stateRecord.planStatus;

  if (!isPlanAwarenessState(planStatusRaw)) return null;
  if (planStatusRaw.status !== 'pending') return null;

  return planStatusRaw;
}

/**
 * Convert a valid pending status to a PendingUser.
 */
function toPendingUser(planStatus: PendingAwarenessState): PendingUser {
  return {
    id: planStatus.user.id,
    name: planStatus.user.name,
    color: planStatus.user.color,
    requestedAt: planStatus.requestedAt,
  };
}

/**
 * Extract all valid pending users from awareness states.
 */
function extractPendingUsersFromStates(
  states: Map<number, unknown>,
  currentPlanId: string,
  now: number
): PendingUser[] {
  const pending: PendingUser[] = [];

  for (const [, state] of states) {
    const planStatus = extractPendingStatus(state);
    if (!planStatus) continue;

    /** Validate and filter */
    if (!hasValidUserData(planStatus)) continue;
    if (!isPendingForPlan(planStatus, currentPlanId, now)) continue;

    pending.push(toPendingUser(planStatus));
  }

  return pending;
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

    const updatePendingUsers = () => {
      const states = awareness.getStates();
      const now = Date.now();
      const pending = extractPendingUsersFromStates(states, currentPlanId, now);

      /** Sort by request time (oldest first) and deduplicate */
      pending.sort((a, b) => a.requestedAt - b.requestedAt);
      setPendingUsers(deduplicateUsers(pending));
    };

    /** Initial update */
    updatePendingUsers();

    /** Listen for awareness changes */
    awareness.on('change', updatePendingUsers);

    return () => {
      awareness.off('change', updatePendingUsers);
    };
  }, [rtcProvider, currentPlanId]);

  return pendingUsers;
}
