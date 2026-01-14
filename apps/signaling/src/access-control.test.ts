import { describe, expect, it, vi } from 'vitest';
import {
  extractPlanId,
  isUserApproved,
  isUserRejected,
  type OutgoingMessageBase,
  type PlanApprovalState,
  send,
  WS_READY_STATE_CLOSED,
  WS_READY_STATE_CLOSING,
  WS_READY_STATE_CONNECTING,
  WS_READY_STATE_OPEN,
} from './access-control.js';
import type { WebSocket } from 'ws';

/**
 * Extended message type for tests with additional properties.
 */
interface TestMessage extends OutgoingMessageBase {
  [key: string]: unknown;
}

/**
 * Create a mock WebSocket for testing.
 * Uses real data structures, not mocks for the Maps.
 */
function createMockWebSocket(readyState: number): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

/**
 * Create a PlanApprovalState for testing.
 */
function createApprovalState(
  planId: string,
  ownerId: string,
  approvedUsers: string[] = [],
  rejectedUsers: string[] = []
): PlanApprovalState {
  return {
    planId,
    ownerId,
    approvedUsers,
    rejectedUsers,
    lastUpdated: Date.now(),
  };
}

describe('isUserApproved', () => {
  it('returns false when no approval state exists', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    const result = isUserApproved(planApprovals, 'plan-1', 'user-1');
    expect(result).toBe(false);
  });

  it('returns false when userId is undefined', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-1']));
    const result = isUserApproved(planApprovals, 'plan-1', undefined);
    expect(result).toBe(false);
  });

  it('returns true for plan owner', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1'));
    const result = isUserApproved(planApprovals, 'plan-1', 'owner-1');
    expect(result).toBe(true);
  });

  it('returns true for approved users', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-1', 'user-2']));
    expect(isUserApproved(planApprovals, 'plan-1', 'user-1')).toBe(true);
    expect(isUserApproved(planApprovals, 'plan-1', 'user-2')).toBe(true);
  });

  it('returns false for non-approved users', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-1']));
    const result = isUserApproved(planApprovals, 'plan-1', 'user-2');
    expect(result).toBe(false);
  });

  it('returns false when user is in rejected list even if in approved list (rejection takes precedence)', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    // User is both in approved and rejected lists - rejection should take precedence
    planApprovals.set(
      'plan-1',
      createApprovalState('plan-1', 'owner-1', ['user-1', 'user-2'], ['user-1'])
    );
    expect(isUserApproved(planApprovals, 'plan-1', 'user-1')).toBe(false);
    expect(isUserApproved(planApprovals, 'plan-1', 'user-2')).toBe(true);
  });

  it('returns false for empty string userId', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-1']));
    // Empty string is falsy in the condition check
    const result = isUserApproved(planApprovals, 'plan-1', '');
    expect(result).toBe(false);
  });

  it('handles multiple plans independently', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-a']));
    planApprovals.set('plan-2', createApprovalState('plan-2', 'owner-2', ['user-b']));

    expect(isUserApproved(planApprovals, 'plan-1', 'user-a')).toBe(true);
    expect(isUserApproved(planApprovals, 'plan-1', 'user-b')).toBe(false);
    expect(isUserApproved(planApprovals, 'plan-2', 'user-a')).toBe(false);
    expect(isUserApproved(planApprovals, 'plan-2', 'user-b')).toBe(true);
  });
});

describe('isUserRejected', () => {
  it('returns false when no approval state exists', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    const result = isUserRejected(planApprovals, 'plan-1', 'user-1');
    expect(result).toBe(false);
  });

  it('returns false when userId is undefined', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set(
      'plan-1',
      createApprovalState('plan-1', 'owner-1', [], ['user-1'])
    );
    const result = isUserRejected(planApprovals, 'plan-1', undefined);
    expect(result).toBe(false);
  });

  it('returns false for plan owner (even if in rejected list)', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    // Owner can never be rejected - they always have access to their own plan
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', [], ['owner-1']));

    const result = isUserRejected(planApprovals, 'plan-1', 'owner-1');
    expect(result).toBe(false);
  });

  it('returns true when user is in rejectedUsers', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set(
      'plan-1',
      createApprovalState('plan-1', 'owner-1', [], ['user-1', 'user-2'])
    );
    expect(isUserRejected(planApprovals, 'plan-1', 'user-1')).toBe(true);
    expect(isUserRejected(planApprovals, 'plan-1', 'user-2')).toBe(true);
  });

  it('returns false when user is not in rejectedUsers', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set(
      'plan-1',
      createApprovalState('plan-1', 'owner-1', ['user-1'], ['user-2'])
    );
    expect(isUserRejected(planApprovals, 'plan-1', 'user-1')).toBe(false);
    expect(isUserRejected(planApprovals, 'plan-1', 'user-3')).toBe(false);
  });

  it('returns false when rejectedUsers is empty', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', ['user-1'], []));
    const result = isUserRejected(planApprovals, 'plan-1', 'user-1');
    expect(result).toBe(false);
  });

  it('handles multiple plans independently', () => {
    const planApprovals = new Map<string, PlanApprovalState>();
    planApprovals.set('plan-1', createApprovalState('plan-1', 'owner-1', [], ['user-a']));
    planApprovals.set('plan-2', createApprovalState('plan-2', 'owner-2', [], ['user-b']));

    expect(isUserRejected(planApprovals, 'plan-1', 'user-a')).toBe(true);
    expect(isUserRejected(planApprovals, 'plan-1', 'user-b')).toBe(false);
    expect(isUserRejected(planApprovals, 'plan-2', 'user-a')).toBe(false);
    expect(isUserRejected(planApprovals, 'plan-2', 'user-b')).toBe(true);
  });
});

describe('send', () => {
  it('successfully sends message when WebSocket is OPEN', () => {
    const ws = createMockWebSocket(WS_READY_STATE_OPEN);
    const message: OutgoingMessageBase = { type: 'pong' };

    const result = send(ws, message);

    expect(result).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(message));
    expect(ws.close).not.toHaveBeenCalled();
  });

  it('successfully sends message when WebSocket is CONNECTING', () => {
    const ws = createMockWebSocket(WS_READY_STATE_CONNECTING);
    const message: OutgoingMessageBase = { type: 'pong' };

    const result = send(ws, message);

    expect(result).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(message));
    expect(ws.close).not.toHaveBeenCalled();
  });

  it('does not send when WebSocket is CLOSED', () => {
    const ws = createMockWebSocket(WS_READY_STATE_CLOSED);
    const message: OutgoingMessageBase = { type: 'pong' };

    const result = send(ws, message);

    expect(result).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it('does not send when WebSocket is CLOSING', () => {
    const ws = createMockWebSocket(WS_READY_STATE_CLOSING);
    const message: OutgoingMessageBase = { type: 'pong' };

    const result = send(ws, message);

    expect(result).toBe(false);
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it('handles serialization errors gracefully', () => {
    const ws = createMockWebSocket(WS_READY_STATE_OPEN);
    // Create a circular reference that cannot be serialized
    const message: TestMessage = { type: 'test' };
    message.self = message;

    const result = send(ws, message);

    expect(result).toBe(false);
    expect(ws.close).toHaveBeenCalled();
  });

  it('handles WebSocket.send throwing an error', () => {
    const ws = createMockWebSocket(WS_READY_STATE_OPEN);
    (ws.send as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('WebSocket error');
    });
    const message: OutgoingMessageBase = { type: 'pong' };

    const result = send(ws, message);

    expect(result).toBe(false);
    expect(ws.close).toHaveBeenCalled();
  });

  it('correctly serializes complex messages', () => {
    const ws = createMockWebSocket(WS_READY_STATE_OPEN);
    const message: TestMessage = {
      type: 'publish',
      topic: 'peer-plan-abc123',
      clients: 5,
      data: { nested: true },
    };

    const result = send(ws, message);

    expect(result).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(message));
  });
});

describe('extractPlanId', () => {
  it('extracts plan ID from valid topic', () => {
    expect(extractPlanId('peer-plan-abc123')).toBe('abc123');
  });

  it('returns null for non-plan topics', () => {
    expect(extractPlanId('other-topic')).toBeNull();
    expect(extractPlanId('plan-abc123')).toBeNull();
    expect(extractPlanId('')).toBeNull();
  });

  it('handles plan IDs with special characters', () => {
    expect(extractPlanId('peer-plan-abc-123')).toBe('abc-123');
    expect(extractPlanId('peer-plan-abc_123')).toBe('abc_123');
  });

  it('handles empty plan ID after prefix', () => {
    expect(extractPlanId('peer-plan-')).toBe('');
  });
});
