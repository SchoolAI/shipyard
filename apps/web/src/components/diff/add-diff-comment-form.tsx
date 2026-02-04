import { Button, TextArea } from '@heroui/react';
import { generateCommentId, generateThreadId, type TaskId } from '@shipyard/loro-schema';
import { MessageSquare, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskDocument } from '@/loro/use-task-document';

function hashLineContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

interface AddDiffCommentFormProps {
  commentType: 'pr' | 'local';
  prNumber?: number;
  currentHeadSha?: string;
  path: string;
  line: number;
  lineContent?: string;
  taskId: TaskId;
  onClose: () => void;
  machineId?: string;
}

export function AddDiffCommentForm({
  commentType,
  prNumber,
  currentHeadSha,
  path,
  line,
  lineContent,
  taskId,
  onClose,
  machineId,
}: AddDiffCommentFormProps) {
  const { identity, startAuth } = useGitHubAuth();
  const taskDoc = useTaskDocument(taskId);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!body.trim()) return;

    if (!identity?.username) {
      startAuth();
      return;
    }

    setIsSubmitting(true);

    const id = generateCommentId();
    const threadId = generateThreadId();
    const now = Date.now();

    const commentsMap = taskDoc.comments;

    if (commentType === 'pr') {
      if (!prNumber) {
        setIsSubmitting(false);
        return;
      }

      commentsMap.set(id, {
        id,
        threadId,
        kind: 'pr',
        body: body.trim(),
        author: identity.username,
        createdAt: now,
        resolved: false,
        inReplyTo: null,
        prNumber,
        path,
        line,
      });
    } else {
      commentsMap.set(id, {
        id,
        threadId,
        kind: 'local',
        body: body.trim(),
        author: identity.username,
        createdAt: now,
        resolved: false,
        inReplyTo: null,
        path,
        line,
        baseRef: currentHeadSha || 'unknown',
        lineContentHash: lineContent ? hashLineContent(lineContent) : '',
        machineId: machineId ?? null,
      });
    }

    taskDoc.logEvent('comment_added', identity.username, {
      commentId: id,
      threadId,
      preview: body.trim().slice(0, 100),
    });

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
    taskDoc,
    onClose,
    startAuth,
    machineId,
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
