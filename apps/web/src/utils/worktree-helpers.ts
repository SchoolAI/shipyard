/**
 * Shared helpers for worktree path parsing and identification.
 *
 * Worktree path convention: `{repo}-wt/{branchName}`
 * e.g. `/Users/dev/my-project-wt/feature-auth`
 */

/**
 * Whether the given path follows the `-wt/` worktree convention.
 */
export function isWorktreePath(path: string): boolean {
  return path.includes('-wt/');
}

/**
 * Extract the branch name from a worktree path.
 * Falls back to the last path segment if the `-wt/` convention is not found.
 */
export function extractBranchFromWorktreePath(wtPath: string): string {
  const wtSegment = wtPath.match(/-wt\/(.+)$/);
  if (wtSegment?.[1]) return wtSegment[1];
  const lastSegment = wtPath.split('/').pop();
  return lastSegment || 'unknown';
}

/**
 * Derive the parent repository path from a worktree path.
 * If the path is not a worktree, returns it unchanged.
 */
export function deriveParentRepoPath(path: string): string {
  if (!isWorktreePath(path)) return path;
  return path.replace(/-wt\/.+$/, '').replace(/\/$/, '');
}
