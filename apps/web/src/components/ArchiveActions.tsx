import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { getPlanIndexEntry, PLAN_INDEX_DOC_NAME, setPlanIndexEntry } from '@peer-plan/schema';
import { Archive, ArchiveRestore, MoreVertical } from 'lucide-react';
import { useState } from 'react';
import type * as Y from 'yjs';
import { useMultiProviderSync } from '@/hooks/useMultiProviderSync';
import type { UserIdentity } from '@/utils/identity';

interface ArchiveActionsProps {
  ydoc: Y.Doc;
  planId: string;
  isArchived: boolean;
  identity: UserIdentity | null;
  onRequestIdentity: () => void;
}

/**
 * Archive/Unarchive actions for plan management.
 * Shows in a dropdown menu in the plan header.
 */
export function ArchiveActions({
  ydoc,
  planId,
  isArchived,
  identity,
  onRequestIdentity,
}: ArchiveActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'archive' | 'unarchive' | null>(null);
  const { ydoc: indexDoc } = useMultiProviderSync(PLAN_INDEX_DOC_NAME);

  const handleAction = (action: 'archive' | 'unarchive') => {
    if (!identity) {
      onRequestIdentity();
      return;
    }
    setShowConfirm(action);
  };

  const confirmAction = async () => {
    if (!showConfirm || !identity) return;

    setIsSubmitting(true);
    try {
      const now = Date.now();

      // Update plan metadata
      ydoc.transact(() => {
        const metadata = ydoc.getMap('metadata');
        if (showConfirm === 'archive') {
          metadata.set('archivedAt', now);
          metadata.set('archivedBy', identity.displayName);
        } else {
          // Unarchive - remove fields
          metadata.delete('archivedAt');
          metadata.delete('archivedBy');
        }
        metadata.set('updatedAt', now);
      });

      // Update plan index
      const existingEntry = getPlanIndexEntry(indexDoc, planId);
      if (existingEntry) {
        if (showConfirm === 'archive') {
          setPlanIndexEntry(indexDoc, {
            ...existingEntry,
            deletedAt: now,
            deletedBy: identity.displayName,
            updatedAt: now,
          });
        } else {
          // Unarchive - remove fields
          const { deletedAt: _removed1, deletedBy: _removed2, ...rest } = existingEntry;
          setPlanIndexEntry(indexDoc, {
            ...rest,
            updatedAt: now,
          });
        }
      }

      setShowConfirm(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelAction = () => {
    setShowConfirm(null);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Dropdown menu when not confirming */}
      {!showConfirm && (
        <Dropdown>
          <DropdownTrigger>
            <Button isIconOnly variant="ghost" size="sm" aria-label="More actions">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Plan actions">
            {isArchived ? (
              <DropdownItem key="unarchive" onPress={() => handleAction('unarchive')}>
                <div className="flex items-center gap-2">
                  <ArchiveRestore className="w-4 h-4" />
                  <span>Unarchive</span>
                </div>
              </DropdownItem>
            ) : (
              <DropdownItem key="archive" onPress={() => handleAction('archive')}>
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4" />
                  <span>Archive</span>
                </div>
              </DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-md">
          <span className="text-sm text-foreground">
            {showConfirm === 'archive' ? 'Archive this plan?' : 'Unarchive this plan?'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="touch-target"
            onPress={confirmAction}
            isDisabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Confirm'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="touch-target"
            onPress={cancelAction}
            isDisabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
