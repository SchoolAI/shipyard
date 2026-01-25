import {
  type PRReviewComment,
  removePRReviewComment,
  resolvePRReviewComment,
} from '@shipyard/schema';
import { useCallback } from 'react';
import type * as Y from 'yjs';
import { PRCommentCard } from './PRCommentCard';

interface PRCommentThreadProps {
  comments: PRReviewComment[];
  ydoc: Y.Doc;
  /** Current user's username for showing delete button on own comments */
  currentUser?: string;
}

/**
 * Renders a group of comments for a single line in the diff.
 * Handles resolve/delete actions via CRDT.
 */
export function PRCommentThread({ comments, ydoc, currentUser }: PRCommentThreadProps) {
  const handleResolve = useCallback(
    (commentId: string, resolved: boolean) => {
      resolvePRReviewComment(ydoc, commentId, resolved);
    },
    [ydoc]
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      removePRReviewComment(ydoc, commentId);
    },
    [ydoc]
  );

  if (comments.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 bg-background border-t border-separator">
      <div className="space-y-2 max-w-2xl">
        {comments.map((comment) => (
          <PRCommentCard
            key={comment.id}
            comment={comment}
            onResolve={handleResolve}
            onDelete={handleDelete}
            currentUser={currentUser}
          />
        ))}
      </div>
    </div>
  );
}
