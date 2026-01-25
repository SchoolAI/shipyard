import { Button, TextArea } from '@heroui/react';
import { addPRReviewComment } from '@shipyard/schema';
import { MessageSquare, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import type * as Y from 'yjs';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

interface AddPRCommentFormProps {
  prNumber: number;
  path: string;
  line: number;
  ydoc: Y.Doc;
  onClose: () => void;
}

/**
 * Form for adding a new comment on a specific line in the diff.
 * Appears when clicking the "+" widget button on a diff line.
 */
export function AddPRCommentForm({ prNumber, path, line, ydoc, onClose }: AddPRCommentFormProps) {
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

    // Generate unique ID
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

    setBody('');
    setIsSubmitting(false);
    onClose();
  }, [body, identity, prNumber, path, line, ydoc, onClose, startAuth]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Cmd/Ctrl+Enter
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      // Close on Escape
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
        {/* Header */}
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

        {/* Auth prompt if not signed in */}
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

        {/* Comment textarea */}
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

        {/* Actions */}
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
