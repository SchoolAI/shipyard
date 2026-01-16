import { execSync } from 'node:child_process';

let cachedUsername: string | null = null;
let cachedRepoName: string | null = null;

/**
 * Gets the current repository name (owner/repo) from the current directory.
 * Uses `gh repo view` to detect the repo from git remotes.
 * Returns null if not in a git repo or gh CLI is not available.
 */
export function getRepositoryFullName(): string | null {
  if (cachedRepoName !== null) {
    return cachedRepoName || null;
  }

  try {
    const repoName = execSync('gh repo view --json nameWithOwner --jq .nameWithOwner', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!repoName) {
      cachedRepoName = '';
      return null;
    }

    cachedRepoName = repoName;
    return cachedRepoName;
  } catch {
    // Not in a git repo, or gh CLI not available - that's okay, repo is optional
    cachedRepoName = '';
    return null;
  }
}

export function getGitHubUsername(): string {
  // TODO: probably need some sort of expiration here
  if (cachedUsername) {
    return cachedUsername;
  }

  try {
    const username = execSync('gh api user --jq .login', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!username) {
      throw new Error('No GitHub username returned');
    }

    cachedUsername = username;
    return cachedUsername;
  } catch {
    throw new Error(
      'GitHub authentication required. Please run: gh auth login\n\n' +
        'This is needed to set plan ownership to your GitHub username.'
    );
  }
}
