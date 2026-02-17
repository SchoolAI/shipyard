import { change, type TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  type DiffComment,
  type DiffCommentScope,
  type DiffCommentSide,
  type DiffState,
  type Message,
  type PermissionDecision,
  type PermissionRequest,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  type PlanComment,
  type PlanVersion,
  type SessionEntry,
  TaskDocumentSchema,
  type TaskDocumentShape,
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
  diffComments: DiffComment[];
  addDiffComment: (comment: {
    filePath: string;
    lineNumber: number;
    side: DiffCommentSide;
    diffScope: DiffCommentScope;
    lineContentHash: string;
    body: string;
    authorId: string;
  }) => string;
  resolveDiffComment: (commentId: string) => void;
  deleteDiffComment: (commentId: string) => void;
  planComments: PlanComment[];
  addPlanComment: (comment: {
    commentId?: string;
    planId: string;
    from: number;
    to: number;
    body: string;
    authorId: string;
  }) => string;
  resolvePlanComment: (commentId: string) => void;
  deletePlanComment: (commentId: string) => void;
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

  const diffCommentsRecord = useDoc(
    handle,
    (d: { diffComments: Record<string, DiffComment> }) => d.diffComments
  );

  const diffComments = useMemo(
    () => Object.values(diffCommentsRecord).sort((a, b) => a.createdAt - b.createdAt),
    [diffCommentsRecord]
  );

  const planCommentsRecord = useDoc(
    handle,
    (d: { planComments: Record<string, PlanComment> }) => d.planComments
  );

  const planComments = useMemo(
    () => Object.values(planCommentsRecord).sort((a, b) => a.createdAt - b.createdAt),
    [planCommentsRecord]
  );

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

  const addDiffComment = useCallback(
    (comment: {
      filePath: string;
      lineNumber: number;
      side: DiffCommentSide;
      diffScope: DiffCommentScope;
      lineContentHash: string;
      body: string;
      authorId: string;
    }): string => {
      const commentId = crypto.randomUUID();
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        draft.diffComments.set(commentId, {
          commentId,
          ...comment,
          authorType: 'human',
          createdAt: Date.now(),
          resolvedAt: null,
        });
      });
      return commentId;
    },
    [handle]
  );

  const resolveDiffComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        const existing = draft.diffComments.get(commentId);
        if (existing) {
          draft.diffComments.set(commentId, {
            ...existing,
            resolvedAt: Date.now(),
          });
        }
      });
    },
    [handle]
  );

  const deleteDiffComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        draft.diffComments.delete(commentId);
      });
    },
    [handle]
  );

  const addPlanComment = useCallback(
    (comment: {
      commentId?: string;
      planId: string;
      from: number;
      to: number;
      body: string;
      authorId: string;
    }): string => {
      const commentId = comment.commentId ?? crypto.randomUUID();
      const { commentId: _discarded, ...commentFields } = comment;
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        draft.planComments.set(commentId, {
          commentId,
          ...commentFields,
          authorType: 'human',
          createdAt: Date.now(),
          resolvedAt: null,
        });
      });
      return commentId;
    },
    [handle]
  );

  const resolvePlanComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        const existing = draft.planComments.get(commentId);
        if (existing) {
          draft.planComments.set(commentId, {
            ...existing,
            resolvedAt: Date.now(),
          });
        }
      });
    },
    [handle]
  );

  const deletePlanComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(handle.doc as unknown as TypedDoc<TaskDocumentShape>, (draft) => {
        draft.planComments.delete(commentId);
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
      diffComments: [],
      addDiffComment: () => '',
      resolveDiffComment: () => {},
      deleteDiffComment: () => {},
      planComments: [],
      addPlanComment: () => '',
      resolvePlanComment: () => {},
      deletePlanComment: () => {},
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
    diffComments,
    addDiffComment,
    resolveDiffComment,
    deleteDiffComment,
    planComments,
    addPlanComment,
    resolvePlanComment,
    deletePlanComment,
    isLoading: !meta,
  };
}
