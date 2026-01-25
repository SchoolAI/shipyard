import { Avatar, Button, Checkbox, Chip, Label } from '@heroui/react';
import { computeCommentStaleness, type DiffComment, type StalenessInfo } from '@shipyard/schema';
import { AlertTriangle, Check, GitCommit, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

interface DiffCommentCardProps {
  /** The comment to display (PR review or local diff comment) */
  comment: DiffComment;
  /** Current HEAD SHA (for staleness detection on local comments) */
  currentHeadSha?: string;
  /** Current content of the line (for content hash staleness detection) */
  currentLineContent?: string;
  /** Callback when resolve status changes */
  onResolve: (commentId: string, resolved: boolean) => void;
  /** Callback when comment is deleted */
  onDelete: (commentId: string) => void;
  /** Current user's username - show delete button only for own comments */
  currentUser?: string;
}

/**
 * Renders a single diff comment (PR review or local) with author, timestamp, and body.
 * Supports resolve/unresolve toggle, delete action, and staleness indicator for local comments.
 */
export function DiffCommentCard({
  comment,
  currentHeadSha,
  currentLineContent,
  onResolve,
  onDelete,
  currentUser,
}: DiffCommentCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(() => {
    setIsDeleting(true);
    onDelete(comment.id);
  }, [comment.id, onDelete]);

  const handleResolveChange = useCallback(
    (isSelected: boolean) => {
      onResolve(comment.id, isSelected);
    },
    [comment.id, onResolve]
  );

  // Format relative time
  const timeAgo = formatRelativeTime(comment.createdAt);

  // Check if current user can delete this comment
  const canDelete = currentUser && currentUser === comment.author;

  // Compute staleness info for local comments using shared utility
  const stalenessInfo = useMemo((): StalenessInfo => {
    // Only check staleness for local diff comments
    if (!('type' in comment) || comment.type !== 'local') {
      return { isStale: false, type: 'none' };
    }

    // Use shared staleness computation from @shipyard/schema
    return computeCommentStaleness(comment, currentHeadSha, currentLineContent);
  }, [comment, currentHeadSha, currentLineContent]);

  // Generate initials for fallback
  const initials = comment.author
    .split(/[-_]/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <div
      className={`flex gap-3 p-3 rounded-lg border transition-colors ${
        comment.resolved
          ? 'bg-success/5 border-success/20'
          : stalenessInfo.isStale
            ? 'bg-warning/5 border-warning/20'
            : 'bg-surface border-separator hover:border-primary/30'
      }`}
    >
      {/* Avatar */}
      <Avatar size="sm" className="shrink-0">
        <Avatar.Image
          src={`https://github.com/${comment.author}.png?size=40`}
          alt={comment.author}
        />
        <Avatar.Fallback>{initials}</Avatar.Fallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm text-foreground">{comment.author}</span>
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
          {comment.resolved && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="w-3 h-3" />
              Resolved
            </span>
          )}
          {stalenessInfo.isStale && (
            <Chip size="sm" color="warning" variant="soft" className="h-5">
              {stalenessInfo.type === 'head_changed' ? (
                <>
                  <GitCommit className="w-3 h-3 mr-1" />
                  HEAD changed
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Line content changed
                </>
              )}
            </Chip>
          )}
        </div>

        {/* Body */}
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{comment.body}</p>

        {/* Actions */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-separator/50">
          <Checkbox
            id={`resolve-${comment.id}`}
            isSelected={comment.resolved ?? false}
            onChange={handleResolveChange}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label htmlFor={`resolve-${comment.id}`} className="text-xs text-muted-foreground">
                Mark resolved
              </Label>
            </Checkbox.Content>
          </Checkbox>

          {canDelete && (
            <Button
              size="sm"
              variant="tertiary"
              isIconOnly
              aria-label="Delete comment"
              onPress={handleDelete}
              isDisabled={isDeleting}
              className="text-muted-foreground hover:text-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }

  // Fall back to date
  return new Date(timestamp).toLocaleDateString();
}
