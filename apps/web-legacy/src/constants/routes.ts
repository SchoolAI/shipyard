/**
 * Application route constants.
 * Centralizes route paths to ensure consistency and prevent typos.
 */

export const ROUTES = {
	INBOX: "/inbox",
	BOARD: "/board",
	SEARCH: "/search",
	ARCHIVE: "/archive",
	TASK: "/task",
} as const;

/**
 * Generate a task detail route path.
 * Use this for all navigation to task/plan pages.
 *
 * @param planId - The plan ID
 * @returns Route path like "/task/abc123"
 */
export function getPlanRoute(planId: string): string {
	return `${ROUTES.TASK}/${planId}`;
}
