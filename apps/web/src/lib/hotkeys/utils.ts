/**
 * Utility functions for keyboard shortcut handling.
 */

import type React from 'react';

/**
 * Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed.
 * Use this for cross-platform keyboard shortcuts.
 */
export function hasCmdOrCtrl(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

/**
 * Check if no modifier keys are pressed.
 */
export function hasNoModifiers(e: KeyboardEvent | React.KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * Detect if the current platform is Mac.
 * Uses modern userAgentData API with fallback to navigator.platform.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };

  if (nav.userAgentData?.platform) {
    return nav.userAgentData.platform === 'macOS';
  }

  return /Mac/.test(navigator.platform);
}

/** Cache platform detection result (platform doesn't change at runtime) */
const IS_MAC = isMacPlatform();

/**
 * Generate platform-aware hint text for submit shortcuts.
 * Returns "⌘+Enter to submit" on Mac, "Ctrl+Enter to submit" on other platforms.
 */
export function getSubmitHint(): string {
  return IS_MAC ? '⌘+Enter to submit' : 'Ctrl+Enter to submit';
}

/**
 * Generate platform-aware shortcut label (shorter version for placeholders).
 * Returns "⌘+Enter" on Mac, "Ctrl+Enter" on other platforms.
 */
export function getSubmitShortcut(): string {
  return IS_MAC ? '⌘+Enter' : 'Ctrl+Enter';
}
