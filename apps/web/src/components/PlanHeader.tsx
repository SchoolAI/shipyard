import type { PlanMetadata, PlanStatusType } from '@peer-plan/schema';
import type * as Y from 'yjs';
import { ReviewActions } from '@/components/ReviewActions';
import { SyncStatus } from '@/components/SyncStatus';
import { Badge } from '@/components/ui/badge';
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

  const getStatusVariant = (status: PlanStatusType) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'pending_review':
        return 'secondary';
      case 'changes_requested':
        return 'destructive';
      case 'draft':
        return 'outline';
      default: {
        // Exhaustiveness check
        status satisfies never;
        return 'outline';
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: Title, metadata, status */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-xl font-semibold truncate">{display.title}</h1>
          <Badge variant={getStatusVariant(display.status)}>
            {display.status.replace('_', ' ')}
          </Badge>
          {(display.repo || display.pr) && (
            <span className="text-sm text-muted-foreground shrink-0">
              {display.repo}
              {display.pr && ` #${display.pr}`}
            </span>
          )}
        </div>
        {syncState && (
          <SyncStatus
            synced={syncState.synced}
            serverCount={syncState.activeCount}
            peerCount={syncState.peerCount}
          />
        )}
      </div>
      {/* Bottom row: Review actions */}
      <ReviewActions
        ydoc={ydoc}
        currentStatus={display.status}
        identity={identity}
        onRequestIdentity={onRequestIdentity}
        onStatusChange={onStatusChange}
      />
    </div>
  );
}
