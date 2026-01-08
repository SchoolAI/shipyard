import { Chip } from '@heroui/react';
import type { PlanMetadata } from '@peer-plan/schema';
import type * as Y from 'yjs';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { StatusChip } from '@/components/StatusChip';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useIsMobile } from '@/hooks/useIsMobile';
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
  /** When true, shows snapshot indicator and hides interactive elements */
  isSnapshot?: boolean;
}

export function PlanHeader({
  ydoc,
  metadata,
  identity,
  onRequestIdentity,
  onStatusChange,
  isSnapshot = false,
}: PlanHeaderProps) {
  // No local state or observer - metadata comes from parent to avoid duplicate observers
  const display = metadata;
  const { syncState } = useActivePlanSync();
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-wrap items-center gap-2 w-full">
      {/* Title and status */}
      <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">{display.title}</h1>
      <StatusChip status={display.status} className="shrink-0" />
      {isSnapshot && (
        <Chip color="warning" variant="soft" className="shrink-0">
          snapshot
        </Chip>
      )}
      {(display.repo || display.pr) && (
        <span className="text-xs md:text-sm text-muted-foreground shrink-0">
          {display.repo}
          {display.pr && ` #${display.pr}`}
        </span>
      )}

      {/* Right side: agents/peers, review actions, share - hidden for snapshots */}
      {!isSnapshot && (
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Presence indicators */}
          {syncState && syncState.activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {syncState.activeCount} {syncState.activeCount === 1 ? 'agent' : 'agents'}
            </span>
          )}
          {syncState && syncState.peerCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-info" />
              {syncState.peerCount} {syncState.peerCount === 1 ? 'peer' : 'peers'}
            </span>
          )}

          {/* Review actions - inline on desktop, floating on mobile */}
          {!isMobile && (
            <ReviewActions
              ydoc={ydoc}
              currentStatus={display.status}
              identity={identity}
              onRequestIdentity={onRequestIdentity}
              onStatusChange={onStatusChange}
            />
          )}

          <ShareButton />
        </div>
      )}
    </div>
  );
}
