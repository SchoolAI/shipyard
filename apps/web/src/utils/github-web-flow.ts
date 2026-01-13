const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
const WORKER_URL = import.meta.env.VITE_GITHUB_OAUTH_WORKER || 'http://localhost:4445';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

/**
 * Start GitHub OAuth web flow.
 * @param redirectUri - Where GitHub should redirect after auth
 * @param options.forceAccountPicker - Force GitHub to show account picker
 * @param options.scope - OAuth scope to request (empty for basic identity, 'repo' for private repo access)
 */
export function startWebFlow(
  redirectUri: string,
  options: { forceAccountPicker?: boolean; scope?: string } = {}
): void {
  const { forceAccountPicker = false, scope = '' } = options;

  const state = generateRandomState();
  sessionStorage.setItem('github-oauth-state', state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  if (forceAccountPicker) {
    params.append('prompt', 'select_account');
  }

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

export async function handleCallback(
  code: string,
  state: string,
  redirectUri: string
): Promise<{ access_token: string; scope?: string }> {
  const storedState = sessionStorage.getItem('github-oauth-state');
  if (state !== storedState) {
    throw new Error('Invalid state parameter - possible CSRF attack');
  }
  sessionStorage.removeItem('github-oauth-state');

  const response = await fetch(`${WORKER_URL}/token-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  if (!response.ok) {
    const error = (await response.json()) as {
      error?: string;
      error_description?: string;
    };
    throw new Error(error.error_description || error.error || 'Token exchange failed');
  }

  return response.json() as Promise<{ access_token: string; scope?: string }>;
}

export async function getGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token is invalid or has been revoked');
    }
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  return response.json();
}

export async function validateToken(token: string): Promise<boolean> {
  try {
    await getGitHubUser(token);
    return true;
  } catch {
    return false;
  }
}

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
