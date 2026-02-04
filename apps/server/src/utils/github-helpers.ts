/**
 * GitHub helper functions.
 *
 * Consolidated from duplicated code:
 * - utils/github-artifacts.ts
 * - mcp/sandbox/github-artifacts.ts
 *
 * This file contains shared GitHub utilities used across the codebase.
 * For artifact-specific functions, see github-artifacts.ts which imports from here.
 *
 * @see docs/engineering-standards.md (3+ Rule)
 */

import { execSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';
import { parseRepoString } from './artifact-helpers.js';
import { logger } from './logger.js';

/**
 * Resolve GitHub token from environment.
 */
export function resolveGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN ?? null;
}

/**
 * Checks if GitHub is configured (has valid token).
 */
export function isGitHubConfigured(): boolean {
  return !!resolveGitHubToken();
}

/**
 * Get Octokit instance with token from environment.
 * Returns null if no token is available.
 */
export function getOctokit(): Octokit | null {
  const token = resolveGitHubToken();
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}

/**
 * Extract status code from an error if it has one.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

/**
 * Check if an error is an authentication error (401/403).
 */
export function isAuthError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 401 || status === 403;
}

/**
 * Custom error class for GitHub authentication failures.
 */
export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubAuthError';
  }
}

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
 * Try to auto-link a PR from the current git branch.
 * Returns PR info if found, null otherwise.
 */
export async function tryAutoLinkPR(repo: string): Promise<{
  prNumber: number;
  url: string;
  status: 'draft' | 'open' | 'merged' | 'closed';
  branch: string;
  title: string;
} | null> {
  const branch = getCurrentBranch();
  if (!branch) return null;

  const octokit = getOctokit();
  if (!octokit) {
    logger.debug('No GitHub token available for PR lookup');
    return null;
  }

  const { owner, repoName } = parseRepoString(repo);

  try {
    /** Look for open PRs from this branch */
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

    /** Use the first (most recent) PR */
    const pr = prs[0];
    if (!pr) return null;

    /** Determine PR status */
    let status: 'draft' | 'open' | 'merged' | 'closed';
    if (pr.merged_at) {
      status = 'merged';
    } else if (pr.state === 'closed') {
      status = 'closed';
    } else if (pr.draft) {
      status = 'draft';
    } else {
      status = 'open';
    }

    return {
      prNumber: pr.number,
      url: pr.html_url,
      status,
      branch,
      title: pr.title,
    };
  } catch (error) {
    logger.warn({ error, repo, branch }, 'Failed to lookup PR from GitHub');
    return null;
  }
}

/** Re-export parseRepoString for convenience */
export { parseRepoString } from './artifact-helpers.js';
