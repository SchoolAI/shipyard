import { useCallback, useEffect, useMemo, useRef } from 'react';

export const AUTOFOCUS_DELAY_MS = 1000;

interface DelayedAutofocusTarget {
  focus: () => void;
}

/**
 * Manages a debounced autofocus timer for keyboard task navigation.
 * When J/K navigates between tasks, focus is delayed so the user
 * can flip through tasks quickly without accidentally interacting with the composer.
 * Each new call to `schedule` resets the timer (debounce).
 */
export function useDelayedAutofocus(targetRef: React.RefObject<DelayedAutofocusTarget | null>) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        targetRef.current?.focus();
      });
      timerRef.current = undefined;
    }, AUTOFOCUS_DELAY_MS);
  }, [targetRef]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return useMemo(() => ({ schedule, cancel }), [schedule, cancel]);
}
