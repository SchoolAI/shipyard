import { change, type TypedDoc } from '@loro-extended/change';
import { useDoc } from '@loro-extended/react';
import {
  buildDocumentId,
  buildTaskConvDocId,
  buildTaskMetaDocId,
  buildTaskReviewDocId,
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
  TaskConversationDocumentSchema,
  type TaskMeta,
  TaskMetaDocumentSchema,
  TaskReviewDocumentSchema,
  type TaskReviewDocumentShape,
  type TodoItem,
} from '@shipyard/loro-schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRepo } from '../providers/repo-provider';

/**
 * Sentinel doc IDs used when no task is selected.
 * These ensure hooks are called unconditionally (rules of hooks).
 * The handles for these IDs are never displayed.
 */
const SENTINEL_META_DOC_ID = buildDocumentId('task-meta', '__sentinel__', DEFAULT_EPOCH);
const SENTINEL_CONV_DOC_ID = buildDocumentId('task-conv', '__sentinel__', DEFAULT_EPOCH);
const SENTINEL_REVIEW_DOC_ID = buildDocumentId('task-review', '__sentinel__', DEFAULT_EPOCH);

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
  pendingFollowUps: Message[];
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
  todoItems: TodoItem[];
  deliveredCommentIds: string[];
  markCommentsDelivered: (commentIds: string[]) => void;
  isLoading: boolean;
}

const EMPTY_PERMISSIONS = new Map<string, PermissionRequest>();

/**
 * useHandle from loro-extended uses useState(() => repo.get(docId, ...))
 * which only runs the factory on first render. When activeTaskId changes
 * from null -> real ID, the handle stays stale (sentinel doc).
 *
 * Fix: call repo.get() directly via useMemo so it reacts to docId changes.
 *
 * Internally manages 3 separate document handles (meta, conversation, review)
 * but exposes the same TaskDocumentResult interface so downstream components
 * don't need to change.
 */
export function useTaskDocument(taskId: string | null): TaskDocumentResult {
  const repo = useRepo();

  const metaDocId = useMemo(
    () => (taskId ? buildTaskMetaDocId(taskId, DEFAULT_EPOCH) : SENTINEL_META_DOC_ID),
    [taskId]
  );
  const convDocId = useMemo(
    () => (taskId ? buildTaskConvDocId(taskId, DEFAULT_EPOCH) : SENTINEL_CONV_DOC_ID),
    [taskId]
  );
  const reviewDocId = useMemo(
    () => (taskId ? buildTaskReviewDocId(taskId, DEFAULT_EPOCH) : SENTINEL_REVIEW_DOC_ID),
    [taskId]
  );

  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const metaHandle = useMemo(
    () => repo.get(metaDocId, TaskMetaDocumentSchema as never),
    [repo, metaDocId]
  );
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const convHandle = useMemo(
    () => repo.get(convDocId, TaskConversationDocumentSchema as never, EPHEMERAL_DECLARATIONS),
    [repo, convDocId]
  );
  // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
  const reviewHandle = useMemo(
    () => repo.get(reviewDocId, TaskReviewDocumentSchema as never),
    [repo, reviewDocId]
  );

  const meta = useDoc(metaHandle, (d: { meta: TaskMeta }) => d.meta);
  const conversation = useDoc(convHandle, (d: { conversation: Message[] }) => d.conversation);
  const pendingFollowUps = useDoc(
    convHandle,
    (d: { pendingFollowUps: Message[] }) => d.pendingFollowUps
  );
  const sessions = useDoc(convHandle, (d: { sessions: SessionEntry[] }) => d.sessions);
  const plans = useDoc(reviewHandle, (d: { plans: PlanVersion[] }) => d.plans);
  const todoItems = useDoc(reviewHandle, (d: { todoItems: TodoItem[] }) => d.todoItems);
  const diffState = useDoc(convHandle, (d: { diffState: DiffState }) => d.diffState);

  const diffCommentsRecord = useDoc(
    reviewHandle,
    (d: { diffComments: Record<string, DiffComment> }) => d.diffComments
  );

  const diffComments = useMemo(
    () => Object.values(diffCommentsRecord ?? {}).sort((a, b) => a.createdAt - b.createdAt),
    [diffCommentsRecord]
  );

  const planCommentsRecord = useDoc(
    reviewHandle,
    (d: { planComments: Record<string, PlanComment> }) => d.planComments
  );

  const planComments = useMemo(
    () => Object.values(planCommentsRecord ?? {}).sort((a, b) => a.createdAt - b.createdAt),
    [planCommentsRecord]
  );

  const rawDeliveredIds: string[] | undefined = useDoc(
    reviewHandle,
    (d: { deliveredCommentIds: string[] }) => d.deliveredCommentIds
  );
  const deliveredCommentIds: string[] = rawDeliveredIds ?? [];

  const markCommentsDelivered = useCallback(
    (commentIds: string[]) => {
      if (commentIds.length === 0) return;
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
        for (const id of commentIds) {
          draft.deliveredCommentIds.push(id);
        }
      });
    },
    [reviewHandle]
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

    const permReqs = convHandle.permReqs;

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
  }, [convHandle, taskId]);

  const respondToPermission = useCallback(
    (
      toolUseId: string,
      decision: PermissionDecision,
      opts?: { persist?: boolean; message?: string }
    ) => {
      convHandle.permResps.set(toolUseId, {
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
    [convHandle]
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
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
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
    [reviewHandle]
  );

  const resolveDiffComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
        const existing = draft.diffComments.get(commentId);
        if (existing) {
          draft.diffComments.set(commentId, {
            ...existing,
            resolvedAt: Date.now(),
          });
        }
      });
    },
    [reviewHandle]
  );

  const deleteDiffComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
        draft.diffComments.delete(commentId);
      });
    },
    [reviewHandle]
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
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
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
    [reviewHandle]
  );

  const resolvePlanComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
        const existing = draft.planComments.get(commentId);
        if (existing) {
          draft.planComments.set(commentId, {
            ...existing,
            resolvedAt: Date.now(),
          });
        }
      });
    },
    [reviewHandle]
  );

  const deletePlanComment = useCallback(
    (commentId: string) => {
      // eslint-disable-next-line no-restricted-syntax -- loro-extended generics require explicit cast
      change(reviewHandle.doc as unknown as TypedDoc<TaskReviewDocumentShape>, (draft) => {
        draft.planComments.delete(commentId);
      });
    },
    [reviewHandle]
  );

  if (!taskId) {
    return {
      meta: null,
      conversation: [],
      pendingFollowUps: [],
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
      todoItems: [],
      deliveredCommentIds: [],
      markCommentsDelivered: () => {},
      isLoading: false,
    };
  }

  return {
    meta,
    conversation,
    pendingFollowUps,
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
    todoItems: todoItems ?? [],
    deliveredCommentIds,
    markCommentsDelivered,
    isLoading: !meta,
  };
}
