/**
 * Application route paths as constants.
 * Re-exports shared routes from @shipyard/loro-schema and adds web-specific routes.
 */
import {
  getTaskPath,
  getTaskUrl as getTaskUrlBase,
  ROUTES as SHARED_ROUTES,
} from '@shipyard/loro-schema';

/** Route path constants (extends shared routes with web-specific paths) */
export const ROUTES = {
  ...SHARED_ROUTES,
  /** Task route pattern for React Router (use getTaskRoute for navigation) */
  TASK_PATTERN: '/task/:id',
  /** Preview test page - developer tool for testing OG previews */
  PREVIEW_TEST: '/preview-test',
} as const;

/**
 * Generate a task route URL for navigation.
 * @param taskId - The task ID to navigate to
 * @returns The full task route path (e.g., "/task/abc123")
 */
export function getTaskRoute(taskId: string): string {
  return getTaskPath(taskId);
}

/**
 * Generate a full task URL including origin for sharing.
 * @param taskId - The task ID
 * @param baseUrl - Optional base URL (defaults to window.location.origin)
 * @returns The full task URL (e.g., "https://example.com/task/abc123")
 */
export function getTaskUrl(taskId: string, baseUrl?: string): string {
  const base =
    baseUrl ??
    (typeof window !== 'undefined'
      ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
      : '');
  return getTaskUrlBase(taskId, base);
}
