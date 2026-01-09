import { getPRReviewCommentsForPR, type PRReviewComment, YDOC_KEYS } from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/**
 * Hook to observe PR review comments for a specific PR from Y.Doc.
 * Returns the current list of comments and updates when the CRDT changes.
 *
 * @param ydoc - The Y.Doc to observe
 * @param prNumber - PR number to filter comments by
 * @returns Array of PR review comments for the specified PR
 */
export function usePRReviewComments(ydoc: Y.Doc, prNumber: number): PRReviewComment[] {
  const [comments, setComments] = useState<PRReviewComment[]>([]);

  useEffect(() => {
    const array = ydoc.getArray(YDOC_KEYS.PR_REVIEW_COMMENTS);

    const update = () => {
      setComments(getPRReviewCommentsForPR(ydoc, prNumber));
    };

    update();
    array.observe(update);
    return () => array.unobserve(update);
  }, [ydoc, prNumber]);

  return comments;
}

/**
 * Gets comments for a specific file path.
 */
export function getCommentsForFile(comments: PRReviewComment[], path: string): PRReviewComment[] {
  return comments.filter((c) => c.path === path);
}
