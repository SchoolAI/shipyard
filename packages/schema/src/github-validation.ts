import { z } from 'zod';

/**
 * Validation schema for GitHub Pull Request API responses.
 *
 * Ensures GitHub API responses contain required fields before creating LinkedPR objects.
 * Prevents runtime errors from malformed or incomplete API responses.
 *
 * NOTE: This schema ONLY validates fields we actively use for LinkedPR creation.
 * GitHub's full PR API response contains 50+ additional fields (created_at, body, user, etc.)
 * that we intentionally exclude because we don't need them. This is a validation layer,
 * not a complete API mirror.
 *
 * Validated fields:
 * - number: PR number for linking
 * - html_url: GitHub URL for display
 * - title: PR title for display
 * - state: 'open' or 'closed' (for status mapping)
 * - draft: Draft status (required by GitHub API, no default needed)
 * - merged: Merged status (required by GitHub API, no default needed)
 * - head.ref: Branch name
 *
 * PERFORMANCE NOTE: Validation overhead is ~0.1-0.5ms per Zod parse, which is negligible
 * compared to CRDT sync operations (~5-50ms) and network I/O. The safety guarantees
 * from runtime validation far outweigh the minimal performance cost.
 *
 * @see https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
 */
export const GitHubPRResponseSchema = z.object({
  number: z.number(),
  html_url: z.string().url(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean(),
  merged: z.boolean(),
  head: z.object({
    ref: z.string(),
  }),
});

export type GitHubPRResponse = z.infer<typeof GitHubPRResponseSchema>;
