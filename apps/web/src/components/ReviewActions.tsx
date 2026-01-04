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
          <button
            type="button"
            onClick={() => handleAction('approve')}
            disabled={isSubmitting || currentStatus === 'approved'}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            {currentStatus === 'approved' ? 'Approved' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => handleAction('request_changes')}
            disabled={isSubmitting || currentStatus === 'changes_requested'}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            {currentStatus === 'changes_requested' ? 'Changes Requested' : 'Request Changes'}
          </button>
        </>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-md">
          <span className="text-sm text-gray-700">
            {showConfirm === 'approve' ? 'Approve this plan?' : 'Request changes to this plan?'}
          </span>
          <button
            type="button"
            onClick={confirmAction}
            disabled={isSubmitting}
            className={`px-3 py-1 text-sm font-medium text-white rounded-md ${
              showConfirm === 'approve'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-500 hover:bg-orange-600'
            } disabled:opacity-50`}
          >
            {isSubmitting ? 'Saving...' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={cancelAction}
            disabled={isSubmitting}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Review info */}
      {isReviewed && !showConfirm && (
        <span className="text-xs text-gray-500 ml-2">Click to change status</span>
      )}
    </div>
  );
}
