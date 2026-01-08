import { Button, Chip, Separator } from '@heroui/react';
import type { PlanMetadata } from '@peer-plan/schema';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { Archive, ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { ReviewActions } from '@/components/ReviewActions';
import { ShareButton } from '@/components/ShareButton';
import { StatusChip } from '@/components/StatusChip';
import { useActivePlanSync } from '@/contexts/ActivePlanSyncContext';
import { useIdentity } from '@/hooks/useIdentity';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import type { UserIdentity } from '@/utils/identity';

interface PlanHeaderProps {
  ydoc: Y.Doc;
  /** Plan ID for archive actions */
  planId: string;
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
  planId,
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
  const isArchived = !!display.archivedAt;
  const { identity: currentIdentity } = useIdentity();
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  const handleArchiveToggle = () => {
    if (!currentIdentity) {
      toast.error('Please set up your profile first');
      return;
    }

    const now = Date.now();

    // Update plan metadata
    ydoc.transact(() => {
      const metadataMap = ydoc.getMap('metadata');
      if (isArchived) {
        metadataMap.delete('archivedAt');
        metadataMap.delete('archivedBy');
      } else {
        metadataMap.set('archivedAt', now);
        metadataMap.set('archivedBy', currentIdentity.displayName);
      }
      metadataMap.set('updatedAt', now);
    });

    // Update plan index
    const entry = getPlanIndexEntry(indexDoc, planId);
    if (entry) {
      if (isArchived) {
        const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = entry;
        setPlanIndexEntry(indexDoc, { ...rest, updatedAt: now });
        toast.success('Plan unarchived');
      } else {
        setPlanIndexEntry(indexDoc, {
          ...entry,
          deletedAt: now,
          deletedBy: currentIdentity.displayName,
          updatedAt: now,
        });
        toast.success('Plan archived');
      }
    }
  };

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

      {/* Archived badge */}
      {isArchived && (
        <Chip color="default" variant="soft" className="shrink-0">
          archived
        </Chip>
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
            <>
              <ReviewActions
                ydoc={ydoc}
                currentStatus={display.status}
                identity={identity}
                onRequestIdentity={onRequestIdentity}
                onStatusChange={onStatusChange}
              />

              {/* Divider between review actions and utility icons */}
              <Separator orientation="vertical" className="h-6" />
            </>
          )}

          <ShareButton />

          {/* Archive icon button */}
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={isArchived ? 'Unarchive plan' : 'Archive plan'}
            onPress={handleArchiveToggle}
            className="touch-target"
          >
            {isArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
