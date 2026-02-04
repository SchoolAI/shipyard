import type { TaskId } from '@shipyard/loro-schema';
import { useCallback } from 'react';
import { useTaskDocument } from '@/loro/use-task-document';
import { DiffCommentCard } from './diff-comment-card';
import type { DiffComment } from './types';

interface DiffCommentThreadProps {
  comments: DiffComment[];
  taskId: TaskId;
  currentUser?: string;
  currentHeadSha?: string;
  lineContentMap?: Map<number, string>;
}

export function DiffCommentThread({
  comments,
  taskId,
  currentUser,
  currentHeadSha,
  lineContentMap,
}: DiffCommentThreadProps) {
  const taskDoc = useTaskDocument(taskId);

  const handleResolve = useCallback(
    (commentId: string, resolved: boolean) => {
      const commentsMap = taskDoc.comments;
      const comment = commentsMap.get(commentId);
      if (comment) {
        comment.resolved = resolved;
      }
    },
    [taskDoc]
  );

  const handleDelete = useCallback(
    (commentId: string) => {
      const commentsMap = taskDoc.comments;
      commentsMap.delete(commentId);
    },
    [taskDoc]
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
