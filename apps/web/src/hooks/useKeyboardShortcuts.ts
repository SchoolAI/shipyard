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
 * Check if focus is in a text input (input, textarea, or contenteditable).
 */
function isInTextInput(target: HTMLElement): boolean {
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

/**
 * Check if key event has no modifier keys (meta, ctrl, alt).
 */
function hasNoModifiers(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** Shortcut definition with matching criteria and handler key */
interface ShortcutDef {
  key: string;
  needsModifier?: boolean;
  allowInInput?: boolean;
  handler: keyof ShortcutHandlers;
}

/** Shortcut definitions - order matters for first match */
const SHORTCUTS: ShortcutDef[] = [
  { key: '[', handler: 'onTogglePanel' },
  { key: ']', handler: 'onExpandPanel' },
  { key: 'Enter', needsModifier: true, allowInInput: true, handler: 'onFullScreen' },
  { key: 'Escape', allowInInput: true, handler: 'onClose' },
  { key: 'j', handler: 'onNextItem' },
  { key: 'k', handler: 'onPrevItem' },
  { key: 'd', handler: 'onDismiss' },
];

/**
 * Check if a keyboard event matches a shortcut definition.
 */
function matchesShortcut(e: KeyboardEvent, def: ShortcutDef, isInputFocused: boolean): boolean {
  if (e.key !== def.key) return false;

  /** Check modifier requirements */
  const hasCmdOrCtrl = e.metaKey || e.ctrlKey;
  if (def.needsModifier && !hasCmdOrCtrl) return false;
  if (!def.needsModifier && !hasNoModifiers(e)) return false;

  /** Check if input focus blocks this shortcut */
  if (isInputFocused && !def.allowInInput) return false;

  return true;
}

/**
 * Register keyboard shortcuts for panel interactions.
 * Automatically ignores shortcuts when focus is in text inputs.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const isInputFocused = isInTextInput(target);

      for (const def of SHORTCUTS) {
        if (matchesShortcut(e, def, isInputFocused)) {
          e.preventDefault();
          handlers[def.handler]?.();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
