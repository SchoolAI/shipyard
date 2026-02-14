import { useDoc } from '@loro-extended/react';
import {
  type A2AMessage,
  buildDocumentId,
  DEFAULT_EPOCH,
  type SessionEntry,
  TaskDocumentSchema,
  type TaskMeta,
} from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * Sentinel doc ID used when no task is selected.
 * This ensures hooks are called unconditionally (rules of hooks).
 * The handle for this ID is never displayed.
 */
const SENTINEL_DOC_ID = buildDocumentId('task', '__sentinel__', DEFAULT_EPOCH);

interface TaskDocumentResult {
  meta: TaskMeta | null;
  conversation: A2AMessage[];
  sessions: SessionEntry[];
  isLoading: boolean;
}

/**
 * useHandle from loro-extended uses useState(() => repo.get(docId, ...))
 * which only runs the factory on first render. When activeTaskId changes
 * from null → real ID, the handle stays stale (sentinel doc).
 *
 * Fix: call repo.get() directly via useMemo so it reacts to docId changes.
 */
export function useTaskDocument(taskId: string | null): TaskDocumentResult {
  const repo = useRepo();

  const docId = useMemo(
    () => (taskId ? buildDocumentId('task', taskId, DEFAULT_EPOCH) : SENTINEL_DOC_ID),
    [taskId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const handle = useMemo(() => repo.get(docId, TaskDocumentSchema as never), [repo, docId]);

  const meta = useDoc(handle, (d: { meta: TaskMeta }) => d.meta);
  const conversation = useDoc(handle, (d: { conversation: A2AMessage[] }) => d.conversation);
  const sessions = useDoc(handle, (d: { sessions: SessionEntry[] }) => d.sessions);

  if (!taskId) {
    return {
      meta: null,
      conversation: [],
      sessions: [],
      isLoading: false,
    };
  }

  return {
    meta,
    conversation,
    sessions,
    isLoading: !meta,
  };
}
