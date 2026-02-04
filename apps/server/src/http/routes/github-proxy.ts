/**
 * GitHub API proxy endpoints.
 *
 * These exist because browser can't call GitHub API directly (CORS).
 * Only 2 endpoints for PR data needed by the diff viewer.
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { ROUTES } from '../../client/index.js';
import type { GitHubClient, PRFile } from '../helpers/github.js';

export interface GitHubProxyContext {
  getClient: () => GitHubClient | null;
  parseRepo: (planId: string) => { owner: string; repo: string } | null;
}

export interface GitHubProxyError {
  code: 'not_found' | 'github_error' | 'not_initialized' | 'invalid_plan';
  message: string;
}

/**
 * GitHub API error with optional status code.
 */
interface GitHubAPIError extends Error {
  status?: number;
}

/**
 * Type guard for GitHub API errors.
 */
function isGitHubAPIError(error: unknown): error is GitHubAPIError {
  return error instanceof Error;
}

/**
 * Result of validating PR request parameters.
 */
type ValidationResult =
  | {
      success: true;
      client: GitHubClient;
      repoInfo: { owner: string; repo: string };
      prNum: number;
    }
  | { success: false; response: Response };

/**
 * Validate PR request parameters and return client/repo info or error response.
 */
function validatePRRequest(
  c: Context,
  proxyCtx: GitHubProxyContext,
  planId: string,
  prNumber: string
): ValidationResult {
  const prNum = Number(prNumber);

  if (Number.isNaN(prNum) || prNum <= 0) {
    return {
      success: false,
      response: c.json<GitHubProxyError>({ code: 'not_found', message: 'Invalid PR number' }, 404),
    };
  }

  const client = proxyCtx.getClient();
  if (!client) {
    return {
      success: false,
      response: c.json<GitHubProxyError>(
        { code: 'not_initialized', message: 'GitHub client not initialized' },
        500
      ),
    };
  }

  const repoInfo = proxyCtx.parseRepo(planId);
  if (!repoInfo) {
    return {
      success: false,
      response: c.json<GitHubProxyError>(
        { code: 'invalid_plan', message: 'Could not determine repository' },
        400
      ),
    };
  }

  return { success: true, client, repoInfo, prNum };
}

/**
 * Handle GitHub API errors and return appropriate response.
 */
function handleGitHubError(c: Context, error: unknown): Response {
  if (isGitHubAPIError(error) && error.status === 404) {
    return c.json<GitHubProxyError>({ code: 'not_found', message: 'PR not found' }, 404);
  }

  const message = isGitHubAPIError(error)
    ? error.message || 'GitHub API error'
    : 'GitHub API error';
  return c.json<GitHubProxyError>({ code: 'github_error', message }, 500);
}

/**
 * Create GitHub proxy routes with injected dependencies.
 */
export function createGitHubProxyRoutes(ctx: GitHubProxyContext) {
  const app = new Hono();

  app.get(ROUTES.PR_DIFF, async (c) => {
    const { id: planId, prNumber } = c.req.param();
    const validation = validatePRRequest(c, ctx, planId, prNumber);

    if (!validation.success) {
      return validation.response;
    }

    const { client, repoInfo, prNum } = validation;

    try {
      const diff = await client.getPRDiff(repoInfo.owner, repoInfo.repo, prNum);
      return c.text(diff);
    } catch (error) {
      return handleGitHubError(c, error);
    }
  });

  app.get(ROUTES.PR_FILES, async (c) => {
    const { id: planId, prNumber } = c.req.param();
    const validation = validatePRRequest(c, ctx, planId, prNumber);

    if (!validation.success) {
      return validation.response;
    }

    const { client, repoInfo, prNum } = validation;

    try {
      const files = await client.getPRFiles(repoInfo.owner, repoInfo.repo, prNum);
      return c.json<PRFile[]>(files);
    } catch (error) {
      return handleGitHubError(c, error);
    }
  });

  return app;
}
