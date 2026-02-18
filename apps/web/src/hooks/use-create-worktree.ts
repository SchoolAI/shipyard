import type { WorktreeCreateResponseEphemeralValue } from '@shipyard/loro-schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomHandle } from './use-room-handle';

const TIMEOUT_MS = 120_000;

interface WorktreeProgress {
  step: string;
  detail?: string;
}

interface CreateWorktreeCallbacks {
  onProgress: (progress: WorktreeProgress) => void;
  onDone: (result: {
    worktreePath: string;
    branchName: string;
    setupScriptStarted: boolean;
    warnings?: string[];
    requestId: string;
  }) => void;
  onError: (message: string) => void;
}

interface UseCreateWorktreeOptions {
  roomHandle: RoomHandle | null;
  machineId: string | null;
}

interface UseCreateWorktreeResult {
  createWorktree: (
    params: {
      sourceRepoPath: string;
      branchName: string;
      baseRef: string;
      setupScript: string | null;
    },
    callbacks: CreateWorktreeCallbacks
  ) => void;
  cancel: () => void;
  isCreating: boolean;
  error: string | null;
  /** The requestId of the last completed worktree creation, for correlating setup results */
  lastCompletedRequestId: string | null;
}

/** Dispatch a single worktree-create response to the appropriate callback. */
function dispatchWorktreeResponse(
  value: WorktreeCreateResponseEphemeralValue,
  requestId: string,
  callbacks: CreateWorktreeCallbacks,
  setError: (e: string) => void,
  cleanup: () => void
): void {
  if (value.status === 'done') {
    callbacks.onDone({
      worktreePath: value.worktreePath ?? '',
      branchName: value.branchName ?? '',
      setupScriptStarted: value.setupScriptStarted ?? false,
      warnings: value.warnings ?? undefined,
      requestId,
    });
    cleanup();
    return;
  }
  if (value.status === 'error') {
    const errMsg = value.error ?? 'Unknown error';
    setError(errMsg);
    callbacks.onError(errMsg);
    cleanup();
    return;
  }
  callbacks.onProgress({
    step: value.status,
    detail: value.detail ?? undefined,
  });
}

export function useCreateWorktree({
  roomHandle,
  machineId,
}: UseCreateWorktreeOptions): UseCreateWorktreeResult {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCompletedRequestId, setLastCompletedRequestId] = useState<string | null>(null);

  const activeRequestIdRef = useRef<string | null>(null);
  const callbacksRef = useRef<CreateWorktreeCallbacks | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Keep a ref to roomHandle so cleanup can delete the request from the correct handle. */
  const roomHandleRef = useRef<RoomHandle | null>(null);
  roomHandleRef.current = roomHandle;

  const cleanup = useCallback(() => {
    const reqId = activeRequestIdRef.current;
    if (reqId) {
      roomHandleRef.current?.worktreeCreateReqs.delete(reqId);
      roomHandleRef.current?.worktreeCreateResps.delete(reqId);
    }
    activeRequestIdRef.current = null;
    callbacksRef.current = null;
    clearTimeout(timeoutRef.current);
    unsubRef.current?.();
    unsubRef.current = null;
    setIsCreating(false);
  }, []);

  const cancel = useCallback(() => {
    setError(null);
    cleanup();
  }, [cleanup]);

  const createWorktree = useCallback(
    (
      params: {
        sourceRepoPath: string;
        branchName: string;
        baseRef: string;
        setupScript: string | null;
      },
      callbacks: CreateWorktreeCallbacks
    ) => {
      if (!roomHandle || !machineId) {
        callbacks.onError('No connection or machine selected');
        return;
      }

      cleanup();

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      callbacksRef.current = callbacks;
      setIsCreating(true);
      setError(null);

      /** Subscribe before writing so we never miss a fast response. */
      const unsub = roomHandle.worktreeCreateResps.subscribe(({ key, value, source }) => {
        if (key !== requestId || !value || source === 'local') return;
        if (activeRequestIdRef.current !== requestId) return;
        if (!callbacksRef.current) return;
        if (value.status === 'done') setLastCompletedRequestId(requestId);
        dispatchWorktreeResponse(value, requestId, callbacksRef.current, setError, cleanup);
      });
      unsubRef.current = unsub;

      timeoutRef.current = setTimeout(() => {
        if (activeRequestIdRef.current !== requestId) return;
        const errMsg = 'Worktree creation timed out';
        setError(errMsg);
        callbacksRef.current?.onError(errMsg);
        cleanup();
      }, TIMEOUT_MS);

      roomHandle.worktreeCreateReqs.set(requestId, {
        machineId,
        sourceRepoPath: params.sourceRepoPath,
        branchName: params.branchName,
        baseRef: params.baseRef,
        setupScript: params.setupScript,
        requestedAt: Date.now(),
      });
    },
    [roomHandle, machineId, cleanup]
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { createWorktree, cancel, isCreating, error, lastCompletedRequestId };
}
