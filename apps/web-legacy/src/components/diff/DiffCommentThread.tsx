import {
  type DiffComment,
  removeLocalDiffComment,
  removePRReviewComment,
  resolveLocalDiffComment,
  resolvePRReviewComment,
} from '@shipyard/schema';
import { useCallback } from 'react';
import type * as Y from 'yjs';
import { DiffCommentCard } from './DiffCommentCard';

interface DiffCommentThreadProps {
  /** Comments to display (can be PR review or local diff comments) */
  comments: DiffComment[];
  /** Y.Doc for CRDT operations */
  ydoc: Y.Doc;
  /** Current user's username for showing delete button on own comments */
  currentUser?: string;
  /** Current HEAD SHA (for staleness detection on local comments) */
  currentHeadSha?: string;
  /** Map of line number to line content (for content hash staleness detection) */
  lineContentMap?: Map<number, string>;
}

/**
 * Renders a group of comments for a single line in the diff.
 * Handles resolve/delete actions via CRDT for both PR and local comments.
 */
export function DiffCommentThread({
  comments,
  ydoc,
  currentUser,
  currentHeadSha,
  lineContentMap,
}: DiffCommentThreadProps) {
  const handleResolve = useCallback(
    (commentId: string, resolved: boolean) => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;

      if ('type' in comment && comment.type === 'local') {
        resolveLocalDiffComment(ydoc, commentId, resolved);
      } else {
        resolvePRReviewComment(ydoc, commentId, resolved);
      }
    },
    [ydoc, comments]
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;

      if ('type' in comment && comment.type === 'local') {
        removeLocalDiffComment(ydoc, commentId);
      } else {
        removePRReviewComment(ydoc, commentId);
      }
    },
    [ydoc, comments]
  );

  if (comments.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 bg-background border-t border-separator">
      <div className="space-y-2 max-w-2xl">
        {comments.map((comment) => (
          <DiffCommentCard
            key={comment.id}
            comment={comment}
            currentHeadSha={currentHeadSha}
            currentLineContent={lineContentMap?.get(comment.line)}
            onResolve={handleResolve}
            onDelete={handleDelete}
            currentUser={currentUser}
          />
        ))}
      </div>
    </div>
  );
}
