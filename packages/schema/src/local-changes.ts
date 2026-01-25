/**
 * Types and schemas for local git changes (working tree diff).
 */
import { z } from 'zod';

/**
 * Status of a file change in git.
 */
export const GitFileStatusSchema = z.enum([
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'untracked',
]);

export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

/**
 * A single file change with diff information.
 */
export const LocalFileChangeSchema = z.object({
  /** File path relative to repo root */
  path: z.string(),
  /** Type of change */
  status: GitFileStatusSchema,
  /** Number of lines added */
  additions: z.number(),
  /** Number of lines deleted */
  deletions: z.number(),
  /** Unified diff patch for this file (optional for binary files) */
  patch: z.string().optional(),
});

export type LocalFileChange = z.infer<typeof LocalFileChangeSchema>;

/**
 * Successful response with local changes data.
 */
export const LocalChangesResponseSchema = z.object({
  available: z.literal(true),
  /** Current branch name (or commit SHA if detached HEAD) */
  branch: z.string(),
  /** Base for comparison (usually 'HEAD') */
  baseBranch: z.string(),
  /** Current HEAD commit SHA (for staleness detection in comments) */
  headSha: z.string().optional(),
  /** Files with staged changes */
  staged: z.array(LocalFileChangeSchema),
  /** Files with unstaged changes */
  unstaged: z.array(LocalFileChangeSchema),
  /** Untracked file paths */
  untracked: z.array(z.string()),
  /** All changed files combined (for diff viewer) */
  files: z.array(LocalFileChangeSchema),
});

export type LocalChangesResponse = z.infer<typeof LocalChangesResponseSchema>;

/**
 * Reason why local changes are unavailable.
 */
export const LocalChangesUnavailableReasonSchema = z.enum([
  'no_cwd',
  'not_git_repo',
  'mcp_not_connected',
  'git_error',
]);

export type LocalChangesUnavailableReason = z.infer<typeof LocalChangesUnavailableReasonSchema>;

/**
 * Response when local changes cannot be retrieved.
 */
export const LocalChangesUnavailableSchema = z.object({
  available: z.literal(false),
  /** Why local changes are unavailable */
  reason: LocalChangesUnavailableReasonSchema,
  /** Human-readable error message */
  message: z.string(),
});

export type LocalChangesUnavailable = z.infer<typeof LocalChangesUnavailableSchema>;

/**
 * Discriminated union for local changes result.
 */
export const LocalChangesResultSchema = z.discriminatedUnion('available', [
  LocalChangesResponseSchema,
  LocalChangesUnavailableSchema,
]);

export type LocalChangesResult = z.infer<typeof LocalChangesResultSchema>;
