import type { EnhancePromptResponseEphemeralValue } from '@shipyard/loro-schema';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomHandle } from './use-room-handle';

const TIMEOUT_MS = 30_000;

interface EnhanceCallbacks {
  onChunk: (accumulated: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

interface UseEnhancePromptOptions {
  roomHandle: RoomHandle | null;
  machineId: string | null;
}

interface UseEnhancePromptResult {
  enhance: (prompt: string, callbacks: EnhanceCallbacks) => void;
  cancel: () => void;
  isEnhancing: boolean;
  error: string | null;
}

/** Dispatch a single enhance-prompt response to the appropriate callback. */
function dispatchEnhanceResponse(
  value: EnhancePromptResponseEphemeralValue,
  callbacks: EnhanceCallbacks,
  setError: (e: string) => void,
  cleanup: () => void
): void {
  if (value.status === 'streaming') {
    callbacks.onChunk(value.text);
    return;
  }
  if (value.status === 'done') {
    callbacks.onDone(value.text);
    cleanup();
    return;
  }
  const errMsg = value.error ?? 'Unknown error';
  setError(errMsg);
  callbacks.onError(errMsg);
  cleanup();
}

export function useEnhancePrompt({
  roomHandle,
  machineId,
}: UseEnhancePromptOptions): UseEnhancePromptResult {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRequestIdRef = useRef<string | null>(null);
  const callbacksRef = useRef<EnhanceCallbacks | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Keep a ref to roomHandle so cleanup can delete the request from the correct handle. */
  const roomHandleRef = useRef<RoomHandle | null>(null);
  roomHandleRef.current = roomHandle;

  const cleanup = useCallback(() => {
    const reqId = activeRequestIdRef.current;
    if (reqId) {
      roomHandleRef.current?.enhancePromptReqs.delete(reqId);
      roomHandleRef.current?.enhancePromptResps.delete(reqId);
    }
    activeRequestIdRef.current = null;
    callbacksRef.current = null;
    clearTimeout(timeoutRef.current);
    unsubRef.current?.();
    unsubRef.current = null;
    setIsEnhancing(false);
  }, []);

  const cancel = useCallback(() => {
    setError(null);
    cleanup();
  }, [cleanup]);

  const enhance = useCallback(
    (prompt: string, callbacks: EnhanceCallbacks) => {
      if (!roomHandle || !machineId) {
        callbacks.onError('No connection or machine selected');
        return;
      }

      cleanup();

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      callbacksRef.current = callbacks;
      setIsEnhancing(true);
      setError(null);

      /** Subscribe before writing so we never miss a fast response. */
      const unsub = roomHandle.enhancePromptResps.subscribe(({ key, value, source }) => {
        if (key !== requestId || !value || source === 'local') return;
        if (activeRequestIdRef.current !== requestId) return;
        if (!callbacksRef.current) return;
        dispatchEnhanceResponse(value, callbacksRef.current, setError, cleanup);
      });
      unsubRef.current = unsub;

      timeoutRef.current = setTimeout(() => {
        if (activeRequestIdRef.current !== requestId) return;
        const errMsg = 'Enhancement timed out';
        setError(errMsg);
        callbacksRef.current?.onError(errMsg);
        cleanup();
      }, TIMEOUT_MS);

      roomHandle.enhancePromptReqs.set(requestId, {
        machineId,
        prompt,
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

  return { enhance, cancel, isEnhancing, error };
}
