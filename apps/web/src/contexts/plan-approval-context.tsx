export { PlanApprovalProvider, usePlanApproval };

import type { PermissionDecision, PermissionRequest, PlanVersion } from '@shipyard/loro-schema';
import { createContext, type ReactNode, useContext } from 'react';

interface PlanApprovalContextValue {
  pendingPermissions: Map<string, PermissionRequest>;
  respondToPermission: (
    toolUseId: string,
    decision: PermissionDecision,
    opts?: { persist?: boolean; message?: string }
  ) => void;
  plans: PlanVersion[];
}

const PlanApprovalContext = createContext<PlanApprovalContextValue | null>(null);

function PlanApprovalProvider({
  pendingPermissions,
  respondToPermission,
  plans,
  children,
}: PlanApprovalContextValue & { children: ReactNode }) {
  return (
    <PlanApprovalContext value={{ pendingPermissions, respondToPermission, plans }}>
      {children}
    </PlanApprovalContext>
  );
}

function usePlanApproval(): PlanApprovalContextValue {
  const ctx = useContext(PlanApprovalContext);
  if (!ctx) {
    throw new Error('usePlanApproval must be used within a <PlanApprovalProvider>');
  }
  return ctx;
}
