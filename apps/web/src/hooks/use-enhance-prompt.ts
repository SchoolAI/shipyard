import type { PersonalRoomConnection, PersonalRoomServerMessage } from '@shipyard/session';
import { useCallback, useEffect, useRef, useState } from 'react';

const TIMEOUT_MS = 30_000;

interface EnhanceCallbacks {
  onChunk: (accumulated: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

interface UseEnhancePromptOptions {
  connection: PersonalRoomConnection | null;
  machineId: string | null;
}

interface UseEnhancePromptResult {
  enhance: (prompt: string, callbacks: EnhanceCallbacks) => void;
  cancel: () => void;
  isEnhancing: boolean;
  error: string | null;
}

export function useEnhancePrompt({
  connection,
  machineId,
}: UseEnhancePromptOptions): UseEnhancePromptResult {
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRequestIdRef = useRef<string | null>(null);
  const accumulatedRef = useRef('');
  const callbacksRef = useRef<EnhanceCallbacks | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cleanup = useCallback(() => {
    activeRequestIdRef.current = null;
    accumulatedRef.current = '';
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
      if (!connection || !machineId) {
        callbacks.onError('No connection or machine selected');
        return;
      }

      cleanup();

      const requestId = crypto.randomUUID();
      activeRequestIdRef.current = requestId;
      accumulatedRef.current = '';
      callbacksRef.current = callbacks;
      setIsEnhancing(true);
      setError(null);

      const unsub = connection.onMessage((msg: PersonalRoomServerMessage) => {
        if (activeRequestIdRef.current !== requestId) return;

        if (msg.type === 'enhance-prompt-chunk' && msg.requestId === requestId) {
          accumulatedRef.current += msg.text;
          callbacksRef.current?.onChunk(accumulatedRef.current);
        } else if (msg.type === 'enhance-prompt-done' && msg.requestId === requestId) {
          callbacksRef.current?.onDone(msg.fullText);
          cleanup();
        } else if (msg.type === 'error' && msg.requestId === requestId) {
          setError(msg.message);
          callbacksRef.current?.onError(msg.message);
          cleanup();
        }
      });
      unsubRef.current = unsub;

      timeoutRef.current = setTimeout(() => {
        if (activeRequestIdRef.current !== requestId) return;
        const errMsg = 'Enhancement timed out';
        setError(errMsg);
        callbacksRef.current?.onError(errMsg);
        cleanup();
      }, TIMEOUT_MS);

      connection.send({
        type: 'enhance-prompt-request',
        requestId,
        machineId,
        prompt,
      });
    },
    [connection, machineId, cleanup]
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { enhance, cancel, isEnhancing, error };
}
