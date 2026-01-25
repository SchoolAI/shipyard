import { Button, TextArea } from '@heroui/react';
import { addLocalDiffComment, addPRReviewComment, hashLineContent } from '@shipyard/schema';
import { MessageSquare, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

interface AddDiffCommentFormProps {
  /** Type of comment: 'pr' for PR review, 'local' for uncommitted changes */
  commentType: 'pr' | 'local';
  /** PR number (required for PR comments) */
  prNumber?: number;
  /** Current HEAD SHA (required for local comments, for staleness detection) */
  currentHeadSha?: string;
  /** File path */
  path: string;
  /** Line number */
  line: number;
  /** Line content at time of comment creation (for local comment staleness detection) */
  lineContent?: string;
  /** Y.Doc for CRDT storage */
  ydoc: Y.Doc;
  /** Callback when form is closed */
  onClose: () => void;
}

/**
 * Form for adding a new comment on a specific line in the diff.
 * Supports both PR review comments and local diff comments.
 * Appears when clicking the "+" widget button on a diff line.
 */
export function AddDiffCommentForm({
  commentType,
  prNumber,
  currentHeadSha,
  path,
  line,
  lineContent,
  ydoc,
  onClose,
}: AddDiffCommentFormProps) {
  const { identity, startAuth } = useGitHubAuth();
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!body.trim()) return;

    if (!identity?.username) {
      startAuth();
      return;
    }

    setIsSubmitting(true);

    if (commentType === 'pr') {
      if (!prNumber) {
        setIsSubmitting(false);
        return;
      }

      const id = `prcomment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      addPRReviewComment(ydoc, {
        id,
        prNumber,
        path,
        line,
        body: body.trim(),
        author: identity.username,
        createdAt: Date.now(),
        resolved: false,
      });
    } else {
      const id = `localcomment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      addLocalDiffComment(ydoc, {
        id,
        type: 'local',
        path,
        line,
        body: body.trim(),
        author: identity.username,
        createdAt: Date.now(),
        baseRef: currentHeadSha || 'unknown',
        resolved: false,
        lineContentHash: lineContent ? hashLineContent(lineContent) : undefined,
      });
    }

    setBody('');
    setIsSubmitting(false);
    onClose();
  }, [
    body,
    identity,
    commentType,
    prNumber,
    currentHeadSha,
    path,
    line,
    lineContent,
    ydoc,
    onClose,
    startAuth,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [handleSubmit, onClose]
  );

  return (
    <div className="px-4 py-3 bg-background border-t border-separator">
      <div className="max-w-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="w-4 h-4" />
            <span>
              Comment on line {line} in <code className="text-xs">{path.split('/').pop()}</code>
            </span>
          </div>
          <Button size="sm" variant="tertiary" isIconOnly aria-label="Cancel" onPress={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {!identity?.username && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
            <p className="text-foreground">
              <Button variant="ghost" size="sm" onPress={() => startAuth()} className="p-0 h-auto">
                Sign in with GitHub
              </Button>{' '}
              to add comments.
            </p>
          </div>
        )}

        <TextArea
          aria-label="Comment"
          placeholder="Add your comment... (Cmd/Ctrl+Enter to submit)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={!identity?.username || isSubmitting}
          autoFocus
          className="w-full"
        />

        <div className="flex justify-end gap-2">
          <Button variant="tertiary" size="sm" onPress={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onPress={handleSubmit}
            isDisabled={!body.trim() || !identity?.username || isSubmitting}
            isPending={isSubmitting}
          >
            Add Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
