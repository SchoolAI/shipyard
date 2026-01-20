import { z } from 'zod';

/**
 * Validation schema for GitHub Pull Request API responses.
 *
 * Ensures GitHub API responses contain required fields before creating LinkedPR objects.
 * Prevents runtime errors from malformed or incomplete API responses.
 *
 * @see https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
 */
export const GitHubPRResponseSchema = z.object({
  number: z.number(),
  html_url: z.string().url(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean().default(false),
  merged: z.boolean().default(false),
  head: z.object({
    ref: z.string(),
  }),
});

export type GitHubPRResponse = z.infer<typeof GitHubPRResponseSchema>;
