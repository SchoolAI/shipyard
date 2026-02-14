import { useDoc } from '@loro-extended/react';
import {
  type A2AMessage,
  buildDocumentId,
  DEFAULT_EPOCH,
  type PermissionDecision,
  type PermissionRequest,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  type SessionEntry,
  TaskDocumentSchema,
  type TaskMeta,
} from '@shipyard/loro-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * Sentinel doc ID used when no task is selected.
 * This ensures hooks are called unconditionally (rules of hooks).
 * The handle for this ID is never displayed.
 */
const SENTINEL_DOC_ID = buildDocumentId('task', '__sentinel__', DEFAULT_EPOCH);

const EPHEMERAL_DECLARATIONS = {
  permReqs: PermissionRequestEphemeral,
  permResps: PermissionResponseEphemeral,
};

export interface TaskDocumentResult {
  meta: TaskMeta | null;
  conversation: A2AMessage[];
  sessions: SessionEntry[];
  pendingPermissions: Map<string, PermissionRequest>;
  respondToPermission: (
    toolUseId: string,
    decision: PermissionDecision,
    opts?: { persist?: boolean; message?: string }
  ) => void;
  isLoading: boolean;
}

const EMPTY_PERMISSIONS = new Map<string, PermissionRequest>();

/**
 * useHandle from loro-extended uses useState(() => repo.get(docId, ...))
 * which only runs the factory on first render. When activeTaskId changes
 * from null -> real ID, the handle stays stale (sentinel doc).
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
  const handle = useMemo(
    () => repo.get(docId, TaskDocumentSchema as never, EPHEMERAL_DECLARATIONS),
    [repo, docId]
  );

  const meta = useDoc(handle, (d: { meta: TaskMeta }) => d.meta);
  const conversation = useDoc(handle, (d: { conversation: A2AMessage[] }) => d.conversation);
  const sessions = useDoc(handle, (d: { sessions: SessionEntry[] }) => d.sessions);

  /**
   * Permission requests from ephemeral state.
   *
   * We subscribe manually instead of using useEphemeral() because the daemon
   * writes entries keyed by toolUseId (not peerId). The useEphemeral hook's
   * `peers` convenience API groups by peerId, which does not match our keying
   * strategy. Manual subscription via getAll() + subscribe() captures all
   * key-value pairs regardless of key semantics.
   */
  const [pendingPermissions, setPendingPermissions] =
    useState<Map<string, PermissionRequest>>(EMPTY_PERMISSIONS);

  useEffect(() => {
    if (!taskId) {
      setPendingPermissions(EMPTY_PERMISSIONS);
      return;
    }

    const permReqs = handle.permReqs;

    const initialState = permReqs.getAll();
    setPendingPermissions(initialState.size > 0 ? new Map(initialState) : EMPTY_PERMISSIONS);

    const unsub = permReqs.subscribe(({ key, value }) => {
      setPendingPermissions((prev) => {
        const next = new Map(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      });
    });

    return unsub;
  }, [handle, taskId]);

  const respondToPermission = useCallback(
    (
      toolUseId: string,
      decision: PermissionDecision,
      opts?: { persist?: boolean; message?: string }
    ) => {
      handle.permResps.set(toolUseId, {
        decision,
        persist: opts?.persist ?? false,
        message: opts?.message ?? null,
        decidedAt: Date.now(),
      });

      setPendingPermissions((prev) => {
        const next = new Map(prev);
        next.delete(toolUseId);
        return next;
      });
    },
    [handle]
  );

  if (!taskId) {
    return {
      meta: null,
      conversation: [],
      sessions: [],
      pendingPermissions: EMPTY_PERMISSIONS,
      respondToPermission,
      isLoading: false,
    };
  }

  return {
    meta,
    conversation,
    sessions,
    pendingPermissions,
    respondToPermission,
    isLoading: !meta,
  };
}
