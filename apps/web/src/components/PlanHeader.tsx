import { Chip } from '@heroui/react';
import type { PlanMetadata, PlanStatusType } from '@peer-plan/schema';
import type * as Y from 'yjs';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import type { UserIdentity } from '@/utils/identity';

interface PlanHeaderProps {
  ydoc: Y.Doc;
  /** Current metadata from parent component */
  metadata: PlanMetadata;
  /** User identity for review actions */
  identity: UserIdentity | null;
  /** Called when user needs to set up identity */
  onRequestIdentity: () => void;
  /** Called after status is successfully updated in the plan doc */
  onStatusChange?: (newStatus: 'approved' | 'changes_requested') => void;
}

export function PlanHeader({
  ydoc,
  metadata,
  identity,
  onRequestIdentity,
  onStatusChange,
}: PlanHeaderProps) {
  // No local state or observer - metadata comes from parent to avoid duplicate observers
  const display = metadata;
  const { syncState } = useActivePlanSync();

  const getStatusChipProps = (
    status: PlanStatusType
  ): { color: 'success' | 'warning' | 'danger' | 'default'; variant: 'soft' | 'tertiary' } => {
    switch (status) {
      case 'approved':
        return { color: 'success', variant: 'soft' };
      case 'pending_review':
        return { color: 'warning', variant: 'soft' };
      case 'changes_requested':
        return { color: 'danger', variant: 'soft' };
      case 'draft':
        return { color: 'default', variant: 'tertiary' };
      default: {
        // Exhaustiveness check
        status satisfies never;
        return { color: 'default', variant: 'tertiary' };
      }
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 w-full">
      {/* Left side: Title and metadata */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold truncate text-foreground">{display.title}</h1>
          <Chip {...getStatusChipProps(display.status)}>{display.status.replace('_', ' ')}</Chip>
          {(display.repo || display.pr) && (
            <span className="text-sm text-muted-foreground shrink-0">
              {display.repo}
              {display.pr && ` #${display.pr}`}
            </span>
          )}
        </div>
        {/* Review actions */}
        <ReviewActions
          ydoc={ydoc}
          currentStatus={display.status}
          identity={identity}
          onRequestIdentity={onRequestIdentity}
          onStatusChange={onStatusChange}
        />
      </div>

      {/* Right side: Sync status and share button */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {syncState && syncState.activeCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {syncState.activeCount} {syncState.activeCount === 1 ? 'agent' : 'agents'}
            </span>
          )}
          {syncState && syncState.peerCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              {syncState.peerCount} {syncState.peerCount === 1 ? 'peer' : 'peers'}
            </span>
          )}
        </div>
        <ShareButton />
      </div>
    </div>
  );
}
