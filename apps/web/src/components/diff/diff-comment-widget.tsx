import { Button, Tooltip } from '@heroui/react';
import type { DiffComment } from '@shipyard/loro-schema';
import { Check, Trash2 } from 'lucide-react';
import { useCallback } from 'react';

interface DiffCommentWidgetProps {
  comments: DiffComment[];
  onResolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  showResolved: boolean;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  if (date.toDateString() === now.toDateString()) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function CommentItem({
  comment,
  onResolve,
  onDelete,
}: {
  comment: DiffComment;
  onResolve: (commentId: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const isResolved = comment.resolvedAt !== null;
  const isAgent = comment.authorType === 'agent';

  const handleResolve = useCallback(
    () => onResolve(comment.commentId),
    [onResolve, comment.commentId]
  );
  const handleDelete = useCallback(
    () => onDelete(comment.commentId),
    [onDelete, comment.commentId]
  );

  return (
    <div className={`flex flex-col gap-1 p-2.5 rounded-md ${isResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {isAgent && (
            <span className="text-[9px] font-medium uppercase tracking-wider px-1 py-0.5 rounded bg-accent/15 text-accent">
              AI
            </span>
          )}
          <span className="text-[10px] text-muted">{formatTimestamp(comment.createdAt)}</span>
          {isResolved && (
            <span className="text-[10px] text-success flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" aria-hidden="true" />
              resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!isResolved && (
            <Tooltip>
              <Tooltip.Trigger>
                <Button
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onPress={handleResolve}
                  aria-label="Resolve comment"
                  className="text-muted hover:text-success w-6 h-6 min-w-0"
                >
                  <Check className="w-3 h-3" />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content>Resolve</Tooltip.Content>
            </Tooltip>
          )}
          <Tooltip>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={handleDelete}
                aria-label="Delete comment"
                className="text-muted hover:text-danger w-6 h-6 min-w-0"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>Delete</Tooltip.Content>
          </Tooltip>
        </div>
      </div>
      <p
        className={`text-xs text-foreground/90 whitespace-pre-wrap ${isResolved ? 'line-through' : ''}`}
      >
        {comment.body}
      </p>
    </div>
  );
}

export function DiffCommentWidget({
  comments,
  onResolve,
  onDelete,
  showResolved,
}: DiffCommentWidgetProps) {
  const visibleComments = showResolved ? comments : comments.filter((c) => c.resolvedAt === null);

  if (visibleComments.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 bg-surface border border-separator/50 rounded-lg mx-2 my-1 overflow-hidden">
      {visibleComments.map((comment) => (
        <CommentItem
          key={comment.commentId}
          comment={comment}
          onResolve={onResolve}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
