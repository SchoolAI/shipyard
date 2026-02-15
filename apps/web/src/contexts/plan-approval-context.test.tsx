import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PlanApprovalProvider, usePlanApproval } from './plan-approval-context';

describe('usePlanApproval', () => {
  it('throws when used outside PlanApprovalProvider', () => {
    expect(() => renderHook(() => usePlanApproval())).toThrow(
      'usePlanApproval must be used within a <PlanApprovalProvider>'
    );
  });

  it('returns context values when inside PlanApprovalProvider', () => {
    const mockRespond = vi.fn();
    const mockPermissions = new Map();
    const mockPlans = [
      {
        planId: 'plan-1',
        toolUseId: 'tu-1',
        markdown: '## Plan',
        reviewStatus: 'pending' as const,
        reviewFeedback: null,
        createdAt: Date.now(),
      },
    ];

    function wrapper({ children }: { children: ReactNode }) {
      return (
        <PlanApprovalProvider
          pendingPermissions={mockPermissions}
          respondToPermission={mockRespond}
          plans={mockPlans}
        >
          {children}
        </PlanApprovalProvider>
      );
    }

    const { result } = renderHook(() => usePlanApproval(), { wrapper });

    expect(result.current.pendingPermissions).toBe(mockPermissions);
    expect(result.current.respondToPermission).toBe(mockRespond);
    expect(result.current.plans).toBe(mockPlans);
  });

  it('returns empty plans array when provider has no plans', () => {
    const emptyPlans: never[] = [];
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <PlanApprovalProvider
          pendingPermissions={new Map()}
          respondToPermission={vi.fn()}
          plans={emptyPlans}
        >
          {children}
        </PlanApprovalProvider>
      );
    }

    const { result } = renderHook(() => usePlanApproval(), { wrapper });
    expect(result.current.plans).toHaveLength(0);
  });
});
