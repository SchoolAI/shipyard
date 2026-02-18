import type { HandleWithEphemerals } from '@loro-extended/repo';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  LOCAL_USER_ID,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
  type TaskIndexDocumentShape,
} from '@shipyard/loro-schema';
import { useMemo } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * The concrete type of a room handle with all ephemeral namespaces.
 *
 * Declared here so `use-enhance-prompt`, `use-create-worktree`,
 * `use-room-capabilities`, and `use-task-index` can all reference it.
 */
export type RoomHandle = HandleWithEphemerals<
  TaskIndexDocumentShape,
  typeof ROOM_EPHEMERAL_DECLARATIONS
>;

/**
 * Returns a stable room-document handle with typed ephemeral stores.
 *
 * This is the canonical way for browser hooks to access the room document's
 * ephemeral namespaces (capabilities, enhancePromptReqs, worktreeCreateReqs, etc.).
 *
 * The handle is memoised on `[repo, userId]` so it stays reference-stable
 * unless the repo is recreated or the user changes.
 */
export function useRoomHandle(userId: string | null = LOCAL_USER_ID): RoomHandle {
  const repo = useRepo();

  const docId = useMemo(
    () =>
      userId
        ? buildDocumentId('room', userId, DEFAULT_EPOCH)
        : buildDocumentId('room', '__sentinel__', DEFAULT_EPOCH),
    [userId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const handle = useMemo(
    () => repo.get(docId, TaskIndexDocumentSchema as never, ROOM_EPHEMERAL_DECLARATIONS),
    [repo, docId]
  );

  // eslint-disable-next-line no-restricted-syntax -- repo.get() returns Handle<S> which lacks typed ephemeral accessors; cast is required until loro-extended generics improve
  return handle as unknown as RoomHandle;
}
