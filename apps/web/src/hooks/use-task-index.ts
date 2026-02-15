import type { TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
  type TaskIndexDocumentShape,
  type TaskIndexEntry,
} from '@shipyard/loro-schema';
import { useMemo, useRef } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * useDoc requires an unconditional Handle (rules of hooks). When userId is null
 * we still call repo.get() with this sentinel ID. The document is inert -- we
 * discard its output immediately and return EMPTY_INDEX instead.
 */
const SENTINEL_DOC_ID = buildDocumentId('room', '__sentinel__', DEFAULT_EPOCH);

export interface TaskIndexResult {
  taskIndex: Record<string, TaskIndexEntry>;
  isLoading: boolean;
  doc: TypedDoc<TaskIndexDocumentShape> | null;
}

const EMPTY_INDEX: Record<string, TaskIndexEntry> = {};

/** Shallow-compare two Record<string, TaskIndexEntry> by keys and field values. */
function taskIndexEqual(
  a: Record<string, TaskIndexEntry>,
  b: Record<string, TaskIndexEntry>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const ae = a[key];
    const be = b[key];
    if (!ae || !be) return false;
    if (
      ae.taskId !== be.taskId ||
      ae.title !== be.title ||
      ae.status !== be.status ||
      ae.createdAt !== be.createdAt ||
      ae.updatedAt !== be.updatedAt
    ) {
      return false;
    }
  }
  return true;
}

export function useTaskIndex(userId: string | null): TaskIndexResult {
  const repo = useRepo();

  const docId = useMemo(
    () => (userId ? buildDocumentId('room', userId, DEFAULT_EPOCH) : SENTINEL_DOC_ID),
    [userId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const handle = useMemo(
    () => repo.get(docId, TaskIndexDocumentSchema as never, ROOM_EPHEMERAL_DECLARATIONS),
    [repo, docId]
  );

  const rawTaskIndex = useDoc(
    handle,
    (d: { taskIndex: Record<string, TaskIndexEntry> }) => d.taskIndex
  );

  const stableRef = useRef<Record<string, TaskIndexEntry>>(EMPTY_INDEX);

  // Return a stable reference when the data hasn't actually changed,
  // avoiding unnecessary downstream re-renders from toJSON() producing new objects.
  const taskIndex = useMemo(() => {
    if (!rawTaskIndex) return stableRef.current;
    if (taskIndexEqual(rawTaskIndex, stableRef.current)) return stableRef.current;
    stableRef.current = rawTaskIndex;
    return rawTaskIndex;
  }, [rawTaskIndex]);

  if (!userId) {
    return {
      taskIndex: EMPTY_INDEX,
      isLoading: false,
      doc: null,
    };
  }

  return {
    taskIndex,
    isLoading: !rawTaskIndex,
    doc: handle.doc as TypedDoc<TaskIndexDocumentShape>,
  };
}
