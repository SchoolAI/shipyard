/**
 * Access control functions for the signaling server.
 *
 * These functions handle approval state management and WebSocket message sending.
 * Extracted into a separate module for testability.
 */

import type { WebSocket } from 'ws';

// --- WebSocket Ready States ---
export const WS_READY_STATE_CONNECTING = 0;
export const WS_READY_STATE_OPEN = 1;
export const WS_READY_STATE_CLOSING = 2;
export const WS_READY_STATE_CLOSED = 3;

// --- Plan Approval State ---

export interface PlanApprovalState {
  planId: string;
  ownerId: string;
  approvedUsers: string[];
  rejectedUsers: string[];
  lastUpdated: number;
}

/**
 * Base interface for outgoing messages.
 * All messages must have a type field.
 */
export interface OutgoingMessageBase {
  type: string;
}

/**
 * Check if a user is approved for a plan.
 * Returns true if user is owner or in approved list (and not rejected).
 *
 * @param planApprovals - The Map of plan approval states
 * @param planId - The plan ID to check approval for
 * @param userId - The user ID to check
 * @returns True if the user is approved
 */
export function isUserApproved(
  planApprovals: Map<string, PlanApprovalState>,
  planId: string,
  userId: string | undefined
): boolean {
  const approval = planApprovals.get(planId);
  if (!approval) return false;
  if (!userId) return false;
  if (userId === approval.ownerId) return true;
  if (approval.rejectedUsers.includes(userId)) return false;
  return approval.approvedUsers.includes(userId);
}

/**
 * Check if a user is rejected for a plan.
 *
 * @param planApprovals - The Map of plan approval states
 * @param planId - The plan ID to check rejection for
 * @param userId - The user ID to check
 * @returns True if the user is rejected
 */
export function isUserRejected(
  planApprovals: Map<string, PlanApprovalState>,
  planId: string,
  userId: string | undefined
): boolean {
  const approval = planApprovals.get(planId);
  if (!approval || !userId) return false;

  // Plan owner can never be rejected (even if somehow in rejected list)
  if (userId === approval.ownerId) return false;

  return approval.rejectedUsers.includes(userId);
}

/**
 * Send a message to a WebSocket connection.
 * Handles connection state checking and error handling.
 *
 * @param conn - The WebSocket connection to send to
 * @param message - The message to send (must have a type field)
 * @returns True if the message was sent successfully, false otherwise
 */
export function send<T extends OutgoingMessageBase>(conn: WebSocket, message: T): boolean {
  // Only send if connection is CONNECTING or OPEN
  if (conn.readyState !== WS_READY_STATE_CONNECTING && conn.readyState !== WS_READY_STATE_OPEN) {
    conn.close();
    return false;
  }
  try {
    conn.send(JSON.stringify(message));
    return true;
  } catch {
    conn.close();
    return false;
  }
}

/**
 * Extract plan ID from topic name.
 * Topics follow the format: "peer-plan-{planId}" for plan documents.
 *
 * @param topic - The topic name to extract from
 * @returns The plan ID or null if not a plan topic
 */
export function extractPlanId(topic: string): string | null {
  const prefix = 'peer-plan-';
  if (topic.startsWith(prefix)) {
    return topic.slice(prefix.length);
  }
  return null;
}
