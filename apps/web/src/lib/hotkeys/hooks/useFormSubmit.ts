/**
 * Hook for Ctrl/Cmd+Enter form submission.
 *
 * Sets up a window-level keyboard listener that triggers the onSubmit callback
 * when Ctrl/Cmd+Enter is pressed (and the form is not disabled).
 *
 * @example
 * ```tsx
 * const { hint } = useFormSubmit({
 *   onSubmit: () => form.submit(),
 *   isDisabled: isSubmitting,
 *   onEscape: () => closeModal(),
 * });
 *
 * <TextArea placeholder={`Type here... (${hint})`} />
 * ```
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { FormSubmitOptions } from '../types';
import { getSubmitHint, hasCmdOrCtrl } from '../utils';

/**
 * Hook that provides Ctrl/Cmd+Enter keyboard shortcut for form submission.
 * Also provides platform-aware hint text for display in placeholders.
 */
export function useFormSubmit(options: FormSubmitOptions) {
  const { onSubmit, isDisabled = false, onEscape, containerRef } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (containerRef?.current && e.target instanceof Node) {
        if (!containerRef.current.contains(e.target)) {
          return;
        }
      }

      if (e.key === 'Enter' && hasCmdOrCtrl(e) && !isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onSubmit();
        return;
      }
      if (e.key === 'Escape' && onEscape && !isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
      }
    },
    [onSubmit, isDisabled, onEscape, containerRef]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  const hint = useMemo(() => getSubmitHint(), []);

  return { hint };
}
