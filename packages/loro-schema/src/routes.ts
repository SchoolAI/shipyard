/**
 * Shared route constants for Shipyard.
 * Used by both web app and server to ensure consistent URLs.
 */

/** Route path constants */
export const ROUTES = {
  /** Home page */
  HOME: '/',
  /** Inbox page */
  INBOX: '/inbox',
  /** Kanban board page */
  BOARD: '/board',
  /** Search page */
  SEARCH: '/search',
  /** Archive page */
  ARCHIVE: '/archive',
  /** Task page base path */
  TASK: '/task',
} as const;

/**
 * Generate a task route path.
 * @param taskId - The task ID
 * @returns The task route path (e.g., "/task/abc123")
 */
export function getTaskPath(taskId: string): string {
  return `${ROUTES.TASK}/${taskId}`;
}

/**
 * Generate a full task URL.
 * @param taskId - The task ID
 * @param baseUrl - Base URL (e.g., "http://localhost:5173")
 * @returns The full task URL (e.g., "http://localhost:5173/task/abc123")
 */
export function getTaskUrl(taskId: string, baseUrl: string): string {
  return `${baseUrl}${getTaskPath(taskId)}`;
}
