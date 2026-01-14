import { Button, Popover, TextArea } from '@heroui/react';
import { logPlanEvent, type PlanStatusType } from '@peer-plan/schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import { VoiceInputButton } from '@/components/voice-input';

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
  onStatusChange?: (newStatus: 'in_progress' | 'changes_requested') => void;
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
  onStatusChange,
}: ReviewActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openPopover, setOpenPopover] = useState<PopoverType>(null);
  const [comment, setComment] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleConfirm = async (action: 'approve' | 'request_changes') => {
    if (!identity) return;

    setIsSubmitting(true);
    try {
      const newStatus = action === 'approve' ? 'in_progress' : 'changes_requested';
      const trimmedComment = comment.trim();

      // Update Y.Doc - hook observes this for distributed approval
      ydoc.transact(() => {
        const metadata = ydoc.getMap('metadata');
        metadata.set('status', newStatus);
        metadata.set('reviewedAt', Date.now());
        metadata.set('reviewedBy', identity.name);
        metadata.set('updatedAt', Date.now());

        // Set or clear reviewComment
        if (trimmedComment) {
          metadata.set('reviewComment', trimmedComment);
        } else {
          metadata.delete('reviewComment');
        }
      });

      const eventType = action === 'approve' ? 'approved' : 'changes_requested';
      logPlanEvent(ydoc, eventType, identity.name);

      setOpenPopover(null);
      setComment('');
      onStatusChange?.(newStatus);
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
