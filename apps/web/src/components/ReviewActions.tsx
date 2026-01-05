import { Button } from '@heroui/react';
import type { PlanStatusType } from '@peer-plan/schema';
import { useState } from 'react';
import type * as Y from 'yjs';
import type { UserIdentity } from '@/utils/identity';

interface ReviewActionsProps {
  ydoc: Y.Doc;
  currentStatus: PlanStatusType;
  identity: UserIdentity | null;
  onRequestIdentity: () => void;
  /** Called after status is successfully updated in the plan doc */
  onStatusChange?: (newStatus: 'approved' | 'changes_requested') => void;
}

/**
 * Approve and Request Changes buttons for plan review.
 *
 * Updates the plan metadata status via Y.Doc.
 */
export function ReviewActions({
  ydoc,
  currentStatus,
  identity,
  onRequestIdentity,
  onStatusChange,
}: ReviewActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'approve' | 'request_changes' | null>(null);

  const handleAction = async (action: 'approve' | 'request_changes') => {
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
      const newStatus = showConfirm === 'approve' ? 'approved' : 'changes_requested';

      // Use transaction to batch updates and trigger observer only once
      ydoc.transact(() => {
        const metadata = ydoc.getMap('metadata');
        metadata.set('status', newStatus);
        metadata.set('reviewedAt', Date.now());
        metadata.set('reviewedBy', identity.displayName);
        metadata.set('updatedAt', Date.now());
      });

      onStatusChange?.(newStatus);

      setShowConfirm(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelAction = () => {
    setShowConfirm(null);
  };

  const isReviewed = currentStatus === 'approved' || currentStatus === 'changes_requested';

  return (
    <div className="flex items-center gap-2">
      {/* Action buttons */}
      {!showConfirm && (
        <>
          <Button
            variant="primary"
            className="bg-success hover:bg-success-dark text-white"
            onPress={() => handleAction('approve')}
            isDisabled={isSubmitting || currentStatus === 'approved'}
          >
            {currentStatus === 'approved' ? 'Approved' : 'Approve'}
          </Button>
          <Button
            variant="danger"
            onPress={() => handleAction('request_changes')}
            isDisabled={isSubmitting || currentStatus === 'changes_requested'}
          >
            {currentStatus === 'changes_requested' ? 'Changes Requested' : 'Request Changes'}
          </Button>
        </>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-md">
          <span className="text-sm text-foreground">
            {showConfirm === 'approve' ? 'Approve this plan?' : 'Request changes to this plan?'}
          </span>
          <Button
            variant={showConfirm === 'approve' ? 'primary' : 'danger'}
            className={
              showConfirm === 'approve' ? 'bg-success hover:bg-success-dark text-white' : ''
            }
            size="sm"
            onPress={confirmAction}
            isDisabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Confirm'}
          </Button>
          <Button variant="secondary" size="sm" onPress={cancelAction} isDisabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      )}

      {/* Review info */}
      {isReviewed && !showConfirm && (
        <span className="text-xs text-muted-foreground ml-2">
          Click to change status
        </span>
      )}
    </div>
  );
}
