import { execSync } from 'node:child_process';

let cachedUsername: string | null = null;

export function getGitHubUsername(): string {
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
