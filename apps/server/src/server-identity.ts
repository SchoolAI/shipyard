import { execSync } from 'node:child_process';
import { githubConfig } from './config/env/github.js';
import { logger } from './logger.js';

let cachedUsername: string | null = null;
let usernameResolved = false;
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

export async function getGitHubUsername(): Promise<string> {
  // No cache expiration needed: The MCP server runs as an ephemeral child process of
  // Claude Code. Each Claude session spawns a fresh server process with empty cache.
  // The username is fetched once per session and cached for the process lifetime,
  // which is inherently bounded by the session duration.
  if (usernameResolved && cachedUsername) {
    return cachedUsername;
  }

  // 1. Try GITHUB_USERNAME env var (explicit)
  if (githubConfig.GITHUB_USERNAME) {
    cachedUsername = githubConfig.GITHUB_USERNAME;
    usernameResolved = true;
    logger.info({ username: cachedUsername }, 'Using GITHUB_USERNAME from env');
    return cachedUsername;
  }

  // 2. Try GITHUB_TOKEN + API
  if (githubConfig.GITHUB_TOKEN) {
    const username = await getUsernameFromToken(githubConfig.GITHUB_TOKEN);
    if (username) {
      cachedUsername = username;
      usernameResolved = true;
      logger.info({ username }, 'Resolved username from GITHUB_TOKEN via API');
      return cachedUsername;
    }
  }

  // 3. Try gh CLI
  const cliUsername = getUsernameFromCLI();
  if (cliUsername) {
    cachedUsername = cliUsername;
    usernameResolved = true;
    logger.info({ username: cliUsername }, 'Resolved username from gh CLI');
    return cachedUsername;
  }

  // 4. Try git config (unverified)
  const gitUsername = getUsernameFromGitConfig();
  if (gitUsername) {
    cachedUsername = gitUsername;
    usernameResolved = true;
    logger.warn({ username: gitUsername }, 'Using git config user.name (UNVERIFIED)');
    return cachedUsername;
  }

  // 5. Try OS username (unverified)
  const osUsername = process.env.USER || process.env.USERNAME;
  if (osUsername) {
    // Issue 3: Sanitize OS username - Windows usernames can contain spaces/special characters
    // Replace invalid characters with underscores to match GitHub username format
    cachedUsername = osUsername.replace(/[^a-zA-Z0-9_-]/g, '_');
    usernameResolved = true;
    logger.warn(
      { username: cachedUsername, original: osUsername },
      'Using sanitized OS username (UNVERIFIED)'
    );
    return cachedUsername;
  }

  // 6. All failed
  usernameResolved = true;
  throw new Error(
    'GitHub username required but could not be determined.\n\n' +
      'Configure ONE of:\n' +
      '1. GITHUB_USERNAME=your-username (explicit)\n' +
      '2. GITHUB_TOKEN=ghp_xxx (will fetch from API)\n' +
      '3. gh auth login (uses CLI)\n' +
      '4. git config --global user.name "your-username"\n' +
      '5. Set USER or USERNAME environment variable\n\n' +
      'For remote agents: Use option 1 or 2'
  );
}

async function getUsernameFromToken(token: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'peer-plan-mcp-server',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const user = (await response.json()) as { login?: string };
    return user.login || null;
  } catch (error) {
    logger.debug({ error }, 'GitHub API failed');
    return null;
  }
}

function getUsernameFromCLI(): string | null {
  try {
    const username = execSync('gh api user --jq .login', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return username || null;
  } catch {
    return null;
  }
}

function getUsernameFromGitConfig(): string | null {
  try {
    const username = execSync('git config user.name', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return username || null;
  } catch {
    return null;
  }
}
