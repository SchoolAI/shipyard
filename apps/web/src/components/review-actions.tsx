import { Button, Popover, TextArea } from '@heroui/react';
import type { TaskId, TaskStatus } from '@shipyard/loro-schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { VoiceInputButton } from '@/components/voice-input';
import { TIMEOUTS } from '@/constants/timings';
import { useUserIdentity } from '@/contexts/user-identity-context';
import { useTaskDocument } from '@/loro/use-task-document';

type ReviewAction = 'approve' | 'request_changes';

/** Maps action to event type for logging */
const getEventType = (action: ReviewAction): 'approved' | 'changes_requested' =>
  action === 'approve' ? 'approved' : 'changes_requested';

/** Maps action to user-facing success message */
const getSuccessMessage = (action: ReviewAction): string =>
  action === 'approve' ? 'Task approved successfully!' : 'Changes requested successfully!';

/** Maps action to user-facing error action label */
const getErrorActionLabel = (action: ReviewAction): string =>
  action === 'approve' ? 'approve' : 'request changes';

/** Checks if the action would be redundant given the current status */
function isRedundantAction(
  action: ReviewAction,
  currentStatus: TaskStatus | undefined
): string | null {
  if (action === 'approve' && currentStatus === 'in_progress') {
    return 'already in progress';
  }
  if (action === 'request_changes' && currentStatus === 'changes_requested') {
    return 'already has changes requested';
  }
  return null;
}

interface ReviewActionsProps {
  taskId: TaskId;
  currentStatus: TaskStatus;
  /** Called after status is successfully updated in the task doc, with the timestamp used for the update */
  onStatusChange?: (newStatus: 'in_progress' | 'changes_requested', updatedAt: number) => void;
}

type PopoverType = 'approve' | 'changes' | null;

/**
 * Approve and Request Changes buttons for task review.
 *
 * Opens a popover with optional comment field before confirming the action.
 * Updates the task metadata status via Loro TaskDocument.
 */
export function ReviewActions({ taskId, currentStatus, onStatusChange }: ReviewActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { actor, hasIdentity } = useUserIdentity();
  const taskDoc = useTaskDocument(taskId);

  /** Auto-focus textarea when Request Changes popover opens */
  useEffect(() => {
    if (openPopover === 'changes' && textareaRef.current) {
      /** Delay ensures popover is rendered before focusing */
      setTimeout(() => textareaRef.current?.focus(), TIMEOUTS.AUTOFOCUS_DELAY);
    }
  }, [openPopover]);

  const handleButtonPress = (type: 'approve' | 'changes') => {
    if (!hasIdentity) {
      toast.error('Please sign in to approve or request changes');
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

  const validateReviewAction = (action: ReviewAction): { valid: boolean } => {
    if (!hasIdentity) {
      toast.error('No identity set - please sign in first');
      return { valid: false };
    }
    if (!taskDoc) {
      toast.error('Document not loaded - please refresh the page');
      return { valid: false };
    }

    const redundantReason = isRedundantAction(action, currentStatus);
    if (redundantReason) {
      toast.info(`Task ${redundantReason}`);
      return { valid: false };
    }

    return { valid: true };
  };

  const executeReviewAction = (
    action: ReviewAction,
    trimmedComment: string
  ): { newStatus: 'in_progress' | 'changes_requested'; timestamp: number } => {
    const newStatus = action === 'approve' ? 'in_progress' : 'changes_requested';
    const timestamp = Date.now();

    // Update status using TaskDocument helper (handles cross-doc sync)
    taskDoc.updateStatus(newStatus, actor);

    // Log the review event (also captures frontier for time travel)
    taskDoc.logEvent(getEventType(action), actor, {
      message: trimmedComment || null,
    });

    return { newStatus, timestamp };
  };

  const handleConfirm = async (action: ReviewAction) => {
    const validation = validateReviewAction(action);
    if (!validation.valid) {
      setOpenPopover(null);
      return;
    }

    setIsSubmitting(true);

    try {
      const { newStatus, timestamp } = executeReviewAction(action, comment.trim());

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
          className="bg-success hover:bg-success-dark text-white text-xs px-3 rounded-lg min-h-[28px] h-7"
          onPress={() => handleButtonPress('approve')}
          isDisabled={
            isSubmitting || currentStatus === 'in_progress' || currentStatus === 'completed'
          }
        >
          Approve
        </Button>

        {/* z-[60] ensures popover renders above mobile drawer (z-50)
            pointer-events-auto restores interactivity since vaul sets body to pointer-events:none
            data-vaul-no-drag prevents vaul drawer from capturing touch events */}
        <Popover.Content
          placement="top"
          className="w-80 z-[60] pointer-events-auto"
          data-vaul-no-drag
        >
          <Popover.Dialog>
            <Popover.Arrow />
            <Popover.Heading>Approve Task</Popover.Heading>

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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isSubmitting) {
                      e.preventDefault();
                      handleConfirm('approve');
                    }
                  }}
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
          className="text-xs px-3 rounded-lg min-h-[28px] h-7"
          onPress={() => handleButtonPress('changes')}
          isDisabled={isSubmitting || currentStatus === 'changes_requested'}
        >
          {currentStatus === 'changes_requested' ? 'Changes' : 'Request Changes'}
        </Button>

        {/* z-[60] ensures popover renders above mobile drawer (z-50)
            pointer-events-auto restores interactivity since vaul sets body to pointer-events:none
            data-vaul-no-drag prevents vaul drawer from capturing touch events */}
        <Popover.Content
          placement="top"
          className="w-80 z-[60] pointer-events-auto"
          data-vaul-no-drag
        >
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isSubmitting) {
                      e.preventDefault();
                      handleConfirm('request_changes');
                    }
                  }}
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
