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
 * @param options.forceConsent - Force GitHub to show consent screen (needed for scope upgrades)
 */
export function startWebFlow(
  redirectUri: string,
  options: { forceAccountPicker?: boolean; scope?: string; forceConsent?: boolean } = {}
): void {
  const { forceAccountPicker = false, scope = '', forceConsent = false } = options;

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

  // Force consent screen when upgrading scopes (otherwise GitHub returns existing token)
  if (forceConsent && scope) {
    params.append('prompt', 'consent');
  }

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

export interface TokenExchangeResponse {
  access_token: string;
  scope?: string;
  is_mobile?: boolean;
}

export async function handleCallback(
  code: string,
  state: string,
  redirectUri: string
): Promise<TokenExchangeResponse> {
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

  return response.json() as Promise<TokenExchangeResponse>;
}

export class TokenValidationError extends Error {
  constructor(
    message: string,
    public readonly isInvalidToken: boolean
  ) {
    super(message);
    this.name = 'TokenValidationError';
  }
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
      throw new TokenValidationError('Token is invalid or has been revoked', true);
    }
    // 403 (rate limit), 5xx (server errors) - token might still be valid
    throw new TokenValidationError(`Failed to fetch user info: ${response.status}`, false);
  }

  return response.json();
}

export type TokenValidationResult =
  | { status: 'valid' }
  | { status: 'invalid' } // Token is genuinely invalid (401) - should logout
  | { status: 'error'; message: string }; // Network/server error - should NOT logout

export async function validateToken(token: string): Promise<TokenValidationResult> {
  try {
    await getGitHubUser(token);
    return { status: 'valid' };
  } catch (err) {
    if (err instanceof TokenValidationError) {
      if (err.isInvalidToken) {
        return { status: 'invalid' };
      }
      // Server error, rate limit, etc. - don't invalidate the token
      return { status: 'error', message: err.message };
    }
    // Network error (fetch failed) - don't invalidate the token
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
