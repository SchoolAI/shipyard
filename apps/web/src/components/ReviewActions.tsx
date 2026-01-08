import { Button } from '@heroui/react';
import type { PlanStatusType } from '@peer-plan/schema';
import { useState } from 'react';
import type * as Y from 'yjs';

/** Simple identity type for display purposes */
interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

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
 * The hook observes the Y.Doc for status changes to unblock.
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

      // Update Y.Doc - hook observes this for distributed approval
      ydoc.transact(() => {
        const metadata = ydoc.getMap('metadata');
        metadata.set('status', newStatus);
        metadata.set('reviewedAt', Date.now());
        metadata.set('reviewedBy', identity.name);
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Action buttons */}
      {!showConfirm && (
        <>
          <Button
            size="sm"
            className="bg-success hover:bg-success-dark text-white touch-target text-xs !h-7 px-3 !min-h-0 rounded-lg"
            onPress={() => handleAction('approve')}
            isDisabled={isSubmitting || currentStatus === 'approved'}
          >
            {currentStatus === 'approved' ? 'Approved' : 'Approve'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="touch-target text-xs !h-7 px-3 !min-h-0 rounded-lg"
            onPress={() => handleAction('request_changes')}
            isDisabled={isSubmitting || currentStatus === 'changes_requested'}
          >
            {currentStatus === 'changes_requested' ? 'Changes' : 'Request Changes'}
          </Button>
        </>
      )}

      {/* Confirmation dialog - stack on mobile */}
      {showConfirm && (
        <div className="flex flex-wrap items-center gap-2 bg-muted px-3 md:px-4 py-2 rounded-md">
          <span className="text-sm text-foreground w-full sm:w-auto">
            {showConfirm === 'approve' ? 'Approve this plan?' : 'Request changes?'}
          </span>
          <Button
            variant={showConfirm === 'approve' ? 'secondary' : 'danger'}
            className={`touch-target ${
              showConfirm === 'approve' ? 'bg-success hover:bg-success-dark text-white' : ''
            }`}
            size="sm"
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
