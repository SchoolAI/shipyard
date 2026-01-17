/**
 * Keyboard shortcuts hook for panel navigation and global actions.
 * Supports panel width toggling, navigation between items, and closing.
 */

import { useEffect } from 'react';

export interface ShortcutHandlers {
  /** Toggle panel ([ key) */
  onTogglePanel?: () => void;
  /** Expand panel (] key) */
  onExpandPanel?: () => void;
  /** Full screen (Cmd/Ctrl+Enter) */
  onFullScreen?: () => void;
  /** Close panel (Escape) */
  onClose?: () => void;
  /** Navigate to next item (j key) */
  onNextItem?: () => void;
  /** Navigate to previous item (k key) */
  onPrevItem?: () => void;
  /** Dismiss current item (d key) */
  onDismiss?: () => void;
}

/**
 * Register keyboard shortcuts for panel interactions.
 * Automatically ignores shortcuts when focus is in text inputs.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keyboard handler must check multiple key combinations
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ignore shortcuts when typing in inputs/textareas or contenteditable
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null;

      // [ - toggle panel (works even in inputs since it's bracket)
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInputFocused) {
        e.preventDefault();
        handlers.onTogglePanel?.();
        return;
      }

      // ] - expand panel
      if (e.key === ']' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInputFocused) {
        e.preventDefault();
        handlers.onExpandPanel?.();
        return;
      }

      // Cmd/Ctrl+Enter - full screen
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlers.onFullScreen?.();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onClose?.();
        return;
      }

      // j/k navigation (vim-style) - skip when in inputs
      if (isInputFocused) return;

      if (e.key === 'j' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.onNextItem?.();
        return;
      }

      if (e.key === 'k' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.onPrevItem?.();
        return;
      }

      // d - dismiss current item
      if (e.key === 'd' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handlers.onDismiss?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
