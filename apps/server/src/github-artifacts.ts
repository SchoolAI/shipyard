import { execSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';
import { logger } from './logger.js';

const ARTIFACTS_BRANCH = 'plan-artifacts';

// Cache the resolved token for the session
let cachedToken: string | null = null;
let tokenResolutionAttempted = false;

/**
 * Parse a "owner/repo" string into owner and repo components.
 * Throws if the format is invalid.
 */
function parseRepoString(repo: string): { owner: string; repoName: string } {
  const parts = repo.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }
  return { owner: parts[0], repoName: parts[1] };
}

/**
 * Check if artifacts feature is enabled via environment variable.
 * Defaults to enabled.
 */
export function isArtifactsEnabled(): boolean {
  const setting = process.env.PEER_PLAN_ARTIFACTS?.toLowerCase();
  return setting !== 'disabled' && setting !== 'false' && setting !== '0';
}

/**
 * Try to get GitHub token from gh CLI.
 * Returns null if gh is not installed or not authenticated.
 */
function getTokenFromGhCli(): string | null {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr
    }).trim();
    if (token) {
      logger.debug('Got GitHub token from gh CLI');
      return token;
    }
  } catch {
    logger.debug('gh CLI not available or not authenticated');
  }
  return null;
}

/**
 * Resolve GitHub token using the following priority:
 * 1. GITHUB_TOKEN environment variable (explicit override)
 * 2. gh CLI token (if gh is installed and authenticated)
 * 3. null (graceful degradation)
 */
export function resolveGitHubToken(): string | null {
  // Return cached token if we've already resolved
  if (tokenResolutionAttempted) {
    return cachedToken;
  }

  tokenResolutionAttempted = true;

  // 1. Check explicit env var first
  if (process.env.GITHUB_TOKEN) {
    logger.debug('Using GITHUB_TOKEN from environment');
    cachedToken = process.env.GITHUB_TOKEN;
    return cachedToken;
  }

  // 2. Try gh CLI
  const ghToken = getTokenFromGhCli();
  if (ghToken) {
    cachedToken = ghToken;
    return cachedToken;
  }

  // 3. No token available
  logger.debug('No GitHub token available');
  cachedToken = null;
  return null;
}

/**
 * Reset token cache. Useful after user runs `gh auth login` externally.
 */
export function resetTokenCache(): void {
  cachedToken = null;
  tokenResolutionAttempted = false;
}

/**
 * Get Octokit instance with token from resolution chain.
 * Returns null if no token is available (graceful degradation).
 */
function getOctokit(): Octokit | null {
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
 */
export async function ensureArtifactsBranch(repo: string): Promise<void> {
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
}

export interface UploadArtifactParams {
  repo: string;
  pr: number;
  planId: string;
  filename: string;
  content: string; // base64 encoded
}

/**
 * Upload an artifact to GitHub.
 * Returns the raw URL for accessing the artifact.
 */
export async function uploadArtifact(params: UploadArtifactParams): Promise<string> {
  const octokit = getOctokit();
  if (!octokit) {
    throw new Error('GITHUB_TOKEN not set');
  }

  const { repo, pr, planId, filename, content } = params;
  const { owner, repoName } = parseRepoString(repo);
  const path = `pr-${pr}/${planId}/${filename}`;

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
}
