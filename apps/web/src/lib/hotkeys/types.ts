/**
 * Type definitions for the hotkeys system.
 */

import type { RefObject } from 'react';

export type ModifierKey = 'ctrl' | 'meta' | 'alt' | 'shift';

/**
 * Options for the useFormSubmit hook.
 */
export interface FormSubmitOptions {
  /** Handler called on Ctrl/Cmd+Enter */
  onSubmit: () => void;
  /** Whether the submit action is disabled */
  isDisabled?: boolean;
  /** Optional handler for Escape key */
  onEscape?: () => void;
  /**
   * Optional container ref for focus scoping.
   * When provided, shortcuts only fire if event target is within this container.
   */
  containerRef?: RefObject<HTMLElement>;
}
