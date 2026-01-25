/**
 * Shared helpers for PR operations across tools.
 * Extracted to reduce duplication between add-artifact.ts and complete-task.ts.
 */
import { execSync } from 'node:child_process';
import {
  createLinkedPR,
  GitHubPRResponseSchema,
  type LinkedPR,
  linkPR,
  logPlanEvent,
} from '@shipyard/schema';
import type * as Y from 'yjs';
import { z } from 'zod';
import { getOctokit, parseRepoString } from '../github-artifacts.js';
import { logger } from '../logger.js';
import { getGitHubUsername } from '../server-identity.js';

/**
 * Get the current git branch name.
 * Returns null if not on a branch or git is unavailable.
 */
export function getCurrentBranch(): string | null {
  try {
    const branch = execSync('git branch --show-current', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!branch) {
      logger.debug('Not on a branch (possibly detached HEAD)');
      return null;
    }

    return branch;
  } catch (error) {
    logger.debug({ error }, 'Could not detect current git branch');
    return null;
  }
}

/**
 * Determine PR status from GitHub API response state.
 */
function determinePRStatus(
  validatedPR: z.infer<typeof GitHubPRResponseSchema>
): 'draft' | 'open' | 'merged' | 'closed' {
  if (validatedPR.merged) return 'merged';
  if (validatedPR.state === 'closed') return 'closed';
  if (validatedPR.draft) return 'draft';
  return 'open';
}

/**
 * Store a linked PR in the Y.Doc and log the event.
 */
async function storePRInDoc(ydoc: Y.Doc, linkedPR: LinkedPR, actorName: string): Promise<void> {
  linkPR(ydoc, linkedPR, actorName);
  logPlanEvent(ydoc, 'pr_linked', actorName, {
    prNumber: linkedPR.prNumber,
    url: linkedPR.url,
  });
}

/**
 * Tries to auto-link a PR from the current git branch.
 * Returns the linked PR if found, null otherwise.
 *
 * This is a shared implementation used by both add-artifact and complete-task
 * to avoid duplicating the GitHub API logic.
 */
export async function tryAutoLinkPR(ydoc: Y.Doc, repo: string): Promise<LinkedPR | null> {
  const branch = getCurrentBranch();
  if (!branch) return null;

  const octokit = getOctokit();
  if (!octokit) {
    logger.debug('No GitHub token available for PR lookup');
    return null;
  }

  const { owner, repoName } = parseRepoString(repo);

  try {
    // Look for open PRs from this branch
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo: repoName,
      head: `${owner}:${branch}`,
      state: 'open',
    });

    if (prs.length === 0) {
      logger.debug({ branch, repo }, 'No open PR found on branch');
      return null;
    }

    // Use the first (most recent) PR
    const pr = prs[0];
    if (!pr) return null;

    // Validate GitHub API response
    const validatedPR = GitHubPRResponseSchema.parse(pr);

    // Handle all PR states exhaustively
    const prState = determinePRStatus(validatedPR);

    // For auto-link, we only want open/draft PRs (query already filtered to open)
    if (prState === 'closed' || prState === 'merged') {
      logger.warn({ prNumber: validatedPR.number, state: prState }, 'PR is not open, not linking');
      return null;
    }

    // Create LinkedPR object using factory for consistent validation
    const linkedPR = createLinkedPR({
      prNumber: validatedPR.number,
      url: validatedPR.html_url,
      status: prState,
      branch,
      title: validatedPR.title,
    });

    // Store in Y.Doc
    const actorName = await getGitHubUsername();
    await storePRInDoc(ydoc, linkedPR, actorName);

    return linkedPR;
  } catch (error) {
    // Validation errors indicate malformed GitHub API response
    if (error instanceof z.ZodError) {
      const fieldErrors = error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      logger.error({ fieldErrors, repo, branch }, 'Invalid GitHub PR response during auto-link');
      return null;
    }
    logger.warn({ error, repo, branch }, 'Failed to lookup PR from GitHub');
    return null;
  }
}
