import { useDoc } from '@loro-extended/react';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  type DiffState,
  type Message,
  type PermissionDecision,
  type PermissionRequest,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  type PlanVersion,
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

export interface LastUserConfig {
  model: string | null;
  machineId: string | null;
  reasoningEffort: string | null;
  permissionMode: string | null;
  cwd: string | null;
}

export interface TaskDocumentResult {
  meta: TaskMeta | null;
  conversation: Message[];
  sessions: SessionEntry[];
  plans: PlanVersion[];
  diffState: DiffState | null;
  lastUserConfig: LastUserConfig | null;
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
  const conversation = useDoc(handle, (d: { conversation: Message[] }) => d.conversation);
  const sessions = useDoc(handle, (d: { sessions: SessionEntry[] }) => d.sessions);
  const plans = useDoc(handle, (d: { plans: PlanVersion[] }) => d.plans);
  const diffState = useDoc(handle, (d: { diffState: DiffState }) => d.diffState);

  const lastUserConfig = useMemo((): LastUserConfig | null => {
    for (let i = conversation.length - 1; i >= 0; i--) {
      const msg = conversation[i];
      if (msg?.role === 'user') {
        return {
          model: msg.model ?? null,
          machineId: msg.machineId ?? null,
          reasoningEffort: msg.reasoningEffort ?? null,
          permissionMode: msg.permissionMode ?? null,
          cwd: msg.cwd ?? null,
        };
      }
    }
    return null;
  }, [conversation]);

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
      plans: [],
      diffState: null,
      lastUserConfig: null,
      pendingPermissions: EMPTY_PERMISSIONS,
      respondToPermission,
      isLoading: false,
    };
  }

  return {
    meta,
    conversation,
    sessions,
    plans,
    diffState,
    lastUserConfig,
    pendingPermissions,
    respondToPermission,
    isLoading: !meta,
  };
}
