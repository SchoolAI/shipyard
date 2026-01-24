/**
 * Utility functions for input request components.
 */

/**
 * Format seconds into MM:SS display string.
 * Returns '--:--' for uninitialized state (negative values).
 */
export function formatTime(seconds: number): string {
  // Handle sentinel value (-1 = not yet initialized)
  if (seconds < 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * "Other" escape hatch constants for choice-type questions.
 * These allow users to provide custom responses not in the predefined options.
 */
export const OTHER_OPTION_VALUE = '__other__';
export const OTHER_OPTION_LABEL = 'Other (please specify)';
