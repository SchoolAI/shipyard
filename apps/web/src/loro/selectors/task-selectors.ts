import { useDoc, useHandle } from '@loro-extended/react';
import { TaskDocumentSchema, type TaskId } from '@shipyard/loro-schema';

export function useTaskHandle(taskId: TaskId) {
  return useHandle(taskId, TaskDocumentSchema);
}

export function useTaskMeta(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.meta);
}

export function useTaskTitle(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.meta.title);
}

export function useTaskStatus(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.meta.status);
}

export function useTaskComments(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.comments);
}

export function useTaskArtifacts(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.artifacts);
}

export function useTaskDeliverables(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.deliverables);
}

export function useTaskEvents(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.events);
}

export function useTaskLinkedPRs(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.linkedPRs);
}

export function useTaskInputRequests(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.inputRequests);
}

export function useTaskChangeSnapshots(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.changeSnapshots);
}

export function useTaskContent(taskId: TaskId) {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.content);
}

export interface InlineThread {
  threadId: string;
  blockId: string;
  selectedText: string | null;
  resolved: boolean;
  comments: Array<{
    id: string;
    body: string;
    author: string;
    createdAt: number;
    inReplyTo: string | null;
  }>;
}

export function useTaskInlineThreads(taskId: TaskId): InlineThread[] {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => {
    const comments = d.comments;
    const threadMap = new Map<string, InlineThread>();

    for (const comment of Object.values(comments)) {
      if (comment.kind !== 'inline') continue;

      const existing = threadMap.get(comment.threadId);
      if (existing) {
        existing.comments.push({
          id: comment.id,
          body: comment.body,
          author: comment.author,
          createdAt: comment.createdAt,
          inReplyTo: comment.inReplyTo,
        });
        if (!comment.resolved) {
          existing.resolved = false;
        }
      } else {
        threadMap.set(comment.threadId, {
          threadId: comment.threadId,
          blockId: comment.blockId,
          selectedText: comment.selectedText,
          resolved: comment.resolved,
          comments: [
            {
              id: comment.id,
              body: comment.body,
              author: comment.author,
              createdAt: comment.createdAt,
              inReplyTo: comment.inReplyTo,
            },
          ],
        });
      }
    }

    for (const thread of threadMap.values()) {
      thread.comments.sort((a, b) => a.createdAt - b.createdAt);
    }

    return Array.from(threadMap.values()).sort((a, b) => {
      const aTime = a.comments[0]?.createdAt ?? 0;
      const bTime = b.comments[0]?.createdAt ?? 0;
      return aTime - bTime;
    });
  });
}

export function useIsTaskArchived(taskId: TaskId): boolean {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.meta.archivedAt !== null);
}

export function useTaskArchivedAt(taskId: TaskId): number | null {
  const handle = useTaskHandle(taskId);
  return useDoc(handle, (d) => d.meta.archivedAt);
}
