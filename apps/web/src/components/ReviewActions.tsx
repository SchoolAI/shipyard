import type { BlockNoteEditor } from '@blocknote/core';
import { Button, Popover, TextArea } from '@heroui/react';
import {
  addSnapshot,
  createPlanSnapshot,
  logPlanEvent,
  type PlanStatusType,
  transitionPlanStatus,
} from '@peer-plan/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { VoiceInputButton } from '@/components/voice-input';
import { useUserIdentity } from '@/contexts/UserIdentityContext';

// Helper functions to reduce complexity in the main component
// These are pure functions that map action types to display values

type ReviewAction = 'approve' | 'request_changes';

/** Maps action to event type for logging */
const getEventType = (action: ReviewAction): 'approved' | 'changes_requested' =>
  action === 'approve' ? 'approved' : 'changes_requested';

/** Creates the reason string for snapshot metadata */
const getSnapshotReason = (action: ReviewAction, reviewerName: string): string =>
  action === 'approve' ? `Approved by ${reviewerName}` : `Changes requested by ${reviewerName}`;

/** Maps action to user-facing success message */
const getSuccessMessage = (action: ReviewAction): string =>
  action === 'approve' ? 'Plan approved successfully!' : 'Changes requested successfully!';

/** Maps action to user-facing error action label */
const getErrorActionLabel = (action: ReviewAction): string =>
  action === 'approve' ? 'approve' : 'request changes';

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
  /** BlockNote editor instance to get current content for snapshots */
  editor: BlockNoteEditor | null;
  /** Called after status is successfully updated in the plan doc, with the timestamp used for the update */
  onStatusChange?: (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => void;
}

type PopoverType = 'approve' | 'changes' | null;

/**
 * Approve and Request Changes buttons for plan review.
 *
 * Opens a popover with optional comment field before confirming the action.
 * Updates the plan metadata status via Y.Doc.
 * The hook observes the Y.Doc for status changes to unblock.
 */
export function ReviewActions({
  ydoc,
  currentStatus,
  identity,
  onRequestIdentity,
  editor,
  onStatusChange,
}: ReviewActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { actor } = useUserIdentity();

  // Auto-focus textarea when Request Changes popover opens
  useEffect(() => {
    if (openPopover === 'changes' && textareaRef.current) {
      // Small delay to ensure popover is rendered
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [openPopover]);

  const handleButtonPress = (type: 'approve' | 'changes') => {
    if (!identity) {
      onRequestIdentity();
      return;
    }
    setOpenPopover(type);
  };

  const handleCancel = () => {
    setOpenPopover(null);
    setComment('');
  };

  const handleTranscript = useCallback((text: string) => {
    setComment((prev) => (prev ? `${prev} ${text}` : text));
  }, []);

  // Validate state before review action
  const validateReviewAction = (
    action: 'approve' | 'request_changes'
  ): { valid: boolean; currentStatus?: PlanStatusType } => {
    if (!identity) {
      toast.error('No identity set - please set up your profile first');
      return { valid: false };
    }

    if (!ydoc) {
      toast.error('Document not loaded - please refresh the page');
      return { valid: false };
    }

    if (!editor) {
      toast.error('Editor not ready - please try again in a moment');
      return { valid: false };
    }

    const metadata = ydoc.getMap('metadata');
    const currentStatus = metadata.get('status') as PlanStatusType;

    if (
      (action === 'approve' && currentStatus === 'in_progress') ||
      (action === 'request_changes' && currentStatus === 'changes_requested')
    ) {
      const statusLabel =
        currentStatus === 'in_progress' ? 'already in progress' : 'already has changes requested';
      toast.info(`Plan ${statusLabel}`);
      return { valid: false };
    }

    return { valid: true, currentStatus };
  };

  // Update Y.Doc with new review status using type-safe transition helper
  const updateReviewStatus = (
    action: 'approve' | 'request_changes',
    trimmedComment: string,
    now: number
  ): 'in_progress' | 'changes_requested' => {
    const reviewerName = identity?.name ?? 'Unknown';
    const newStatus = action === 'approve' ? 'in_progress' : 'changes_requested';

    const result = transitionPlanStatus(
      ydoc,
      action === 'approve'
        ? { status: 'in_progress', reviewedAt: now, reviewedBy: reviewerName }
        : {
            status: 'changes_requested',
            reviewedAt: now,
            reviewedBy: reviewerName,
            reviewComment: trimmedComment || undefined,
          },
      actor
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    return newStatus;
  };

  // Execute the review action - updates doc, logs event, creates snapshot
  const executeReviewAction = (
    action: ReviewAction,
    validEditor: BlockNoteEditor,
    trimmedComment: string,
    timestamp: number
  ): { newStatus: 'in_progress' | 'changes_requested'; timestamp: number } => {
    const reviewerName = identity?.name ?? 'Unknown';
    const newStatus = updateReviewStatus(action, trimmedComment, timestamp);

    logPlanEvent(ydoc, getEventType(action), reviewerName);

    const snapshot = createPlanSnapshot(
      ydoc,
      getSnapshotReason(action, reviewerName),
      reviewerName,
      newStatus,
      validEditor.document
    );
    addSnapshot(ydoc, snapshot);

    return { newStatus, timestamp };
  };

  const handleConfirm = async (action: ReviewAction) => {
    const validation = validateReviewAction(action);
    if (!validation.valid || !editor) {
      if (!editor) toast.error('Editor not ready');
      setOpenPopover(null);
      return;
    }

    setIsSubmitting(true);

    try {
      const { newStatus, timestamp } = executeReviewAction(
        action,
        editor,
        comment.trim(),
        Date.now()
      );

      toast.success(getSuccessMessage(action));
      setOpenPopover(null);
      setComment('');
      onStatusChange?.(newStatus, timestamp);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during status update';
      toast.error(`Failed to ${getErrorActionLabel(action)}: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Approve Button with Popover */}
      <Popover
        isOpen={openPopover === 'approve'}
        onOpenChange={(open) => setOpenPopover(open ? 'approve' : null)}
      >
        <Button
          size="sm"
          className="bg-success hover:bg-success-dark text-white text-xs px-4 rounded-lg min-h-[36px]"
          onPress={() => handleButtonPress('approve')}
          isDisabled={
            isSubmitting || currentStatus === 'in_progress' || currentStatus === 'completed'
          }
        >
          Approve
        </Button>

        <Popover.Content placement="top" className="w-80">
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Approve Plan</Popover.Heading>

            <div className="mt-3 space-y-3">
              <label htmlFor="approve-comment" className="block text-xs text-muted-foreground">
                Feedback for the agent (optional)
              </label>
              <div className="relative">
                <TextArea
                  id="approve-comment"
                  placeholder="Great work! Consider also..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="w-full pr-12"
                />
                <VoiceInputButton
                  onTranscript={handleTranscript}
                  className="absolute right-2 bottom-2"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onPress={handleCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-success text-white"
                  onPress={() => handleConfirm('approve')}
                  isDisabled={isSubmitting}
                  isPending={isSubmitting}
                >
                  Approve
                </Button>
              </div>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>

      {/* Request Changes Button with Popover */}
      <Popover
        isOpen={openPopover === 'changes'}
        onOpenChange={(open) => setOpenPopover(open ? 'changes' : null)}
      >
        <Button
          variant="danger"
          size="sm"
          className="text-xs px-4 rounded-lg min-h-[36px]"
          onPress={() => handleButtonPress('changes')}
          isDisabled={isSubmitting || currentStatus === 'changes_requested'}
        >
          {currentStatus === 'changes_requested' ? 'Changes' : 'Request Changes'}
        </Button>

        <Popover.Content placement="top" className="w-80">
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Request Changes</Popover.Heading>

            <div className="mt-3 space-y-3">
              <label htmlFor="changes-comment" className="block text-xs text-muted-foreground">
                What should the agent change?
              </label>
              <div className="relative">
                <TextArea
                  id="changes-comment"
                  ref={textareaRef}
                  placeholder="Please update the error handling to..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="w-full pr-12"
                />
                <VoiceInputButton
                  onTranscript={handleTranscript}
                  className="absolute right-2 bottom-2"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onPress={handleCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onPress={() => handleConfirm('request_changes')}
                  isDisabled={isSubmitting}
                  isPending={isSubmitting}
                >
                  Submit
                </Button>
              </div>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </div>
  );
}
