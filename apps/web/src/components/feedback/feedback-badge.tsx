import { Button, Popover } from '@heroui/react';
import { Check, Clock, MessageSquare, Send, Square } from 'lucide-react';
import { type KeyboardEvent, useCallback, useRef, useState } from 'react';
import type { UseFeedbackActionsResult } from '../../hooks/use-feedback-actions';

interface CommentSummary {
  filePath: string;
  body: string;
  lineNumber: number;
}

type FeedbackBadgeProps = UseFeedbackActionsResult;

const MOD_KEY =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl';

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function LiveAnnouncement({ children }: { children: string }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {children}
    </div>
  );
}

function ConfirmationBadge({ label, filled }: { label: string; filled: boolean }) {
  const className = filled
    ? 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-success text-success-foreground touch:min-h-[44px]'
    : 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-success text-success touch:min-h-[44px]';
  return (
    <span className={className}>
      <Check className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

function EmptyBadge() {
  return (
    <span
      role="status"
      aria-label="No unresolved comments"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted touch:min-h-[44px]"
    >
      <MessageSquare className="w-3.5 h-3.5" />0
    </span>
  );
}

function FeedbackPopoverContent({
  headerText,
  commentSummaries,
  additionalText,
  onTextChange,
  onKeyDown,
  textareaRef,
}: {
  headerText: string;
  commentSummaries: CommentSummary[];
  additionalText: string;
  onTextChange: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <>
      <Popover.Heading className="text-xs font-medium mb-2">{headerText}</Popover.Heading>
      <FeedbackSummaryList summaries={commentSummaries} />
      <textarea
        ref={textareaRef}
        value={additionalText}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Add context for the agent... (optional)"
        rows={2}
        className="w-full mt-2 px-3 py-2 text-sm bg-background border border-separator/50 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-accent text-foreground placeholder:text-muted"
        aria-label="Additional feedback context"
      />
      <p className="text-[10px] text-muted mt-1" aria-hidden="true">
        {MOD_KEY}+Enter to submit
      </p>
    </>
  );
}

export function FeedbackBadge({
  unresolvedCount,
  fileCount,
  isAgentRunning,
  feedbackState,
  commentSummaries,
  onSendFeedback,
  onQueueFeedback,
  onInterruptAndSend: onInterruptAndSendFeedback,
}: FeedbackBadgeProps) {
  const [additionalText, setAdditionalText] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetAndClose = useCallback(() => {
    setAdditionalText('');
    setIsPopoverOpen(false);
  }, []);

  const handleSend = useCallback(() => {
    onSendFeedback(additionalText);
    resetAndClose();
  }, [onSendFeedback, additionalText, resetAndClose]);

  const handleQueue = useCallback(() => {
    onQueueFeedback(additionalText);
    resetAndClose();
  }, [onQueueFeedback, additionalText, resetAndClose]);

  const handleInterrupt = useCallback(() => {
    onInterruptAndSendFeedback(additionalText);
    resetAndClose();
  }, [onInterruptAndSendFeedback, additionalText, resetAndClose]);

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isAgentRunning) {
          handleQueue();
        } else {
          handleSend();
        }
      }
    },
    [isAgentRunning, handleQueue, handleSend]
  );

  const headerText =
    fileCount > 0
      ? `${unresolvedCount} ${pluralize('comment', unresolvedCount)} on ${fileCount} ${pluralize('file', fileCount)}`
      : `${unresolvedCount} ${pluralize('comment', unresolvedCount)} on plan`;

  if (feedbackState === 'sent') {
    return (
      <>
        <LiveAnnouncement>Feedback sent to agent</LiveAnnouncement>
        <ConfirmationBadge label="Sent" filled />
      </>
    );
  }

  if (feedbackState === 'queued') {
    return (
      <>
        <LiveAnnouncement>Feedback queued for agent</LiveAnnouncement>
        <ConfirmationBadge label="Queued" filled={false} />
      </>
    );
  }

  if (unresolvedCount === 0) {
    return <EmptyBadge />;
  }

  const popoverContent = (
    <FeedbackPopoverContent
      headerText={headerText}
      commentSummaries={commentSummaries}
      additionalText={additionalText}
      onTextChange={setAdditionalText}
      onKeyDown={handleTextareaKeyDown}
      textareaRef={textareaRef}
    />
  );

  if (isAgentRunning) {
    return (
      <>
        <LiveAnnouncement>
          {`${unresolvedCount} unresolved ${pluralize('comment', unresolvedCount)} ready to queue`}
        </LiveAnnouncement>
        <Popover isOpen={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <Popover.Trigger>
            <button
              type="button"
              aria-expanded={isPopoverOpen}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-warning text-warning hover:bg-warning/10 transition-colors cursor-pointer touch:min-h-[44px]"
            >
              <Clock className="w-3.5 h-3.5" />
              Queue {unresolvedCount} {pluralize('comment', unresolvedCount)}
            </button>
          </Popover.Trigger>
          <Popover.Content placement="bottom end" className="w-80">
            <Popover.Dialog className="p-3">
              {popoverContent}
              <div className="flex items-center justify-between mt-3 gap-2">
                <button
                  type="button"
                  className="text-xs text-muted hover:text-foreground transition-colors underline decoration-dotted underline-offset-2 touch:min-h-[44px]"
                  onClick={handleInterrupt}
                >
                  <span className="inline-flex items-center gap-1">
                    <Square className="w-3 h-3" />
                    Stop agent &amp; send now
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-3 min-w-0 border border-warning text-warning hover:bg-warning/10"
                  onPress={handleQueue}
                >
                  Queue feedback
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </>
    );
  }

  return (
    <>
      <LiveAnnouncement>
        {`${unresolvedCount} unresolved ${pluralize('comment', unresolvedCount)} ready to send`}
      </LiveAnnouncement>
      <Popover isOpen={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger>
          <button
            type="button"
            aria-expanded={isPopoverOpen}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-warning text-warning-foreground hover:brightness-110 transition-all cursor-pointer touch:min-h-[44px]"
          >
            Send {unresolvedCount} {pluralize('comment', unresolvedCount)} &rarr;
          </button>
        </Popover.Trigger>
        <Popover.Content placement="bottom end" className="w-80">
          <Popover.Dialog className="p-3">
            {popoverContent}
            <div className="flex justify-end mt-3">
              <Button
                size="sm"
                variant="primary"
                className="text-xs h-7 px-3 min-w-0 bg-warning text-warning-foreground"
                onPress={handleSend}
              >
                <Send className="w-3.5 h-3.5" />
                Send to AI
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
    </>
  );
}

function FeedbackSummaryList({ summaries }: { summaries: CommentSummary[] }) {
  if (summaries.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1 text-xs text-muted" aria-label="Comment summaries">
      {summaries.map((s, i) => (
        <li
          key={`${s.filePath}-${s.lineNumber}-${i}`}
          className="flex items-baseline gap-1.5 min-w-0"
        >
          <span className="shrink-0 text-[10px] text-muted/60 font-mono truncate max-w-[120px]">
            {s.filePath === '(plan)' ? 'plan' : s.filePath.split('/').pop()}
          </span>
          {s.filePath !== '(plan)' && (
            <span className="shrink-0 text-[10px] text-muted/40">L{s.lineNumber}</span>
          )}
          <span className="truncate text-foreground/80">{s.body}</span>
        </li>
      ))}
    </ul>
  );
}
