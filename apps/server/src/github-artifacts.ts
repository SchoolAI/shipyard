import { Octokit } from '@octokit/rest';
import { githubConfig } from './config/env/github.js';
import { logger } from './logger.js';

const ARTIFACTS_BRANCH = 'plan-artifacts';

/**
 * Parse a "owner/repo" string into owner and repo components.
 * Throws if the format is invalid.
 */
export function parseRepoString(repo: string): { owner: string; repoName: string } {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repoName: parts[1] };
}

/**
 * Check if artifacts feature is enabled.
 * Configured via PEER_PLAN_ARTIFACTS environment variable (defaults to enabled).
 */
export function isArtifactsEnabled(): boolean {
  return githubConfig.PEER_PLAN_ARTIFACTS;
}

/**
 * Resolve GitHub token from config.
 * Priority: GITHUB_TOKEN env var > gh CLI token > null
 *
 * Token resolution happens once at config load time.
 * To refresh token (e.g., after running `gh auth login`), restart the server.
 */
export function resolveGitHubToken(): string | null {
  return githubConfig.GITHUB_TOKEN;
}

/**
 * Check if an error is an authentication error (401/403).
 */
export function isAuthError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  return status === 401 || status === 403;
}

/**
 * Custom error class for GitHub authentication failures.
 * Makes it easy to detect and handle auth errors in tool handlers.
 */
export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubAuthError';
  }
}

/**
 * Execute a GitHub API operation with automatic token refresh on auth errors.
 * If a 401/403 occurs, resets the token cache and retries once with a fresh token.
 */
async function withTokenRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    if (isAuthError(error)) {
      logger.info('GitHub auth error, refreshing token and retrying...');
      resetTokenCache();

      // Check if we got a new token
      const newToken = resolveGitHubToken();
      if (!newToken) {
        throw new GitHubAuthError(
          'GitHub token expired and could not be refreshed.\n\n' +
            'To fix this, run in your terminal:\n' +
            '  gh auth login\n\n' +
            'Or set GITHUB_TOKEN environment variable in your MCP config.'
        );
      }

      // Retry once with fresh token
      try {
        return await operation();
      } catch (retryError: unknown) {
        if (isAuthError(retryError)) {
          throw new GitHubAuthError(
            'GitHub authentication failed after token refresh.\n\n' +
              'Your token may not have the required permissions.\n' +
              'Run: gh auth login --scopes repo\n\n' +
              'Or check your GITHUB_TOKEN has repo access.'
          );
        }
        throw retryError;
      }
    }
    throw error;
  }
}

/**
 * Get Octokit instance with token from resolution chain.
 * Returns null if no token is available (graceful degradation).
 */
export function getOctokit(): Octokit | null {
  const token = resolveGitHubToken();
  if (!token) {
    return null;
  }
  return new Octokit({ auth: token });
}

/**
 * Checks if GitHub is configured (has valid token).
 */
export function isGitHubConfigured(): boolean {
  return !!resolveGitHubToken();
}

/**
 * Ensures the artifacts branch exists.
 * Creates it from the default branch if it doesn't exist.
 * Automatically retries with a fresh token on auth errors.
 */
export async function ensureArtifactsBranch(repo: string): Promise<void> {
  return withTokenRetry(async () => {
    const octokit = getOctokit();
    if (!octokit) {
      throw new Error('GITHUB_TOKEN not set');
    }

    const { owner, repoName } = parseRepoString(repo);

    // Check if branch exists
    try {
      await octokit.repos.getBranch({
        owner,
        repo: repoName,
        branch: ARTIFACTS_BRANCH,
      });
      logger.debug({ repo }, 'Artifacts branch exists');
      return;
    } catch (error: unknown) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
      // Branch doesn't exist, need to create it
    }

    logger.info({ repo }, 'Creating artifacts branch');

    try {
      // Get the default branch SHA
      const { data: repoData } = await octokit.repos.get({ owner, repo: repoName });
      const defaultBranch = repoData.default_branch;

      const { data: refData } = await octokit.git.getRef({
        owner,
        repo: repoName,
        ref: `heads/${defaultBranch}`,
      });

      // Create the artifacts branch from default branch
      await octokit.git.createRef({
        owner,
        repo: repoName,
        ref: `refs/heads/${ARTIFACTS_BRANCH}`,
        sha: refData.object.sha,
      });

      logger.info({ repo, branch: ARTIFACTS_BRANCH }, 'Created artifacts branch');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to create "${ARTIFACTS_BRANCH}" branch. Please create it manually:\n\n` +
          `  git checkout --orphan ${ARTIFACTS_BRANCH}\n` +
          `  git rm -rf .\n` +
          `  git commit --allow-empty -m "Initialize plan artifacts"\n` +
          `  git push -u origin ${ARTIFACTS_BRANCH}\n` +
          `  git checkout main\n\n` +
          `Error: ${message}`
      );
    }
  });
}

export interface UploadArtifactParams {
  repo: string;
  planId: string;
  filename: string;
  content: string; // base64 encoded
}

/**
 * Upload an artifact to GitHub.
 * Returns the raw URL for accessing the artifact.
 * Automatically retries with a fresh token on auth errors.
 */
export async function uploadArtifact(params: UploadArtifactParams): Promise<string> {
  return withTokenRetry(async () => {
    const octokit = getOctokit();
    if (!octokit) {
      throw new Error('GITHUB_TOKEN not set');
    }

    const { repo, planId, filename, content } = params;
    const { owner, repoName } = parseRepoString(repo);
    const path = `plans/${planId}/${filename}`;

    // Ensure branch exists
    await ensureArtifactsBranch(repo);

    // Check if file already exists (need SHA for update)
    let existingSha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref: ARTIFACTS_BRANCH,
      });
      if (!Array.isArray(data) && data.type === 'file') {
        existingSha = data.sha;
      }
    } catch (error: unknown) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
      // File doesn't exist, that's fine
    }

    // Upload/update file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path,
      message: `Add artifact: ${filename}`,
      content,
      branch: ARTIFACTS_BRANCH,
      sha: existingSha,
    });

    const url = `https://raw.githubusercontent.com/${repo}/${ARTIFACTS_BRANCH}/${path}`;
    logger.info({ repo, path, url }, 'Artifact uploaded');

    return url;
  });
}
