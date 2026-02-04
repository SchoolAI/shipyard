/**
 * Timing constants for UI interactions and behaviors.
 *
 * Centralizes all magic numbers related to timeouts, intervals, and durations
 * to improve maintainability and make timing behavior easier to tune.
 */

/**
 * UI interaction timeouts (milliseconds).
 */
export const TIMEOUTS = {
  /** Delay before auto-focusing an input after UI renders */
  AUTOFOCUS_DELAY: 50,
  /** Duration to show success icon before reverting to original */
  ICON_REVERT_DELAY: 2000,
  /** Delay before clearing progress indicator after operation completes */
  PROGRESS_CLEAR_DELAY: 1000,
} as const;

/**
 * Polling and check intervals (milliseconds).
 */
export const INTERVALS = {
  /** How often to check for expired input requests */
  EXPIRATION_CHECK: 5000,
  /** How often to update countdown timer display (1 second) */
  COUNTDOWN_UPDATE: 1000,
  /** How often to poll for PR file changes */
  PR_POLL: 15000,
  /** How often to update presence "last active" timestamp */
  PRESENCE_HEARTBEAT: 30000,
} as const;

/**
 * Toast notification durations (milliseconds).
 */
export const TOAST_DURATIONS = {
  /** Default info toast duration */
  INFO: 5000,
  /** Success toast duration */
  SUCCESS: 3000,
  /** Error toast duration */
  ERROR: 8000,
  /** Input request toast duration (longer to allow response) */
  INPUT_REQUEST: 60000,
} as const;

/**
 * Thresholds for UI warnings and states (seconds).
 */
export const THRESHOLDS = {
  /** Show warning when timeout countdown drops below this (seconds) */
  TIMEOUT_WARNING: 30,
} as const;

/**
 * Type helpers for accessing timing constants.
 */
export type Timeout = (typeof TIMEOUTS)[keyof typeof TIMEOUTS];
export type Interval = (typeof INTERVALS)[keyof typeof INTERVALS];
export type ToastDuration = (typeof TOAST_DURATIONS)[keyof typeof TOAST_DURATIONS];
export type Threshold = (typeof THRESHOLDS)[keyof typeof THRESHOLDS];
