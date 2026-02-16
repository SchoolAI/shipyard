import { SignalingClient } from '@shipyard/session/client';

const OAUTH_STATE_KEY = 'shipyard-oauth-state';

export function buildGitHubAuthorizeUrl(clientId: string, redirectUri: string): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  sessionServerUrl: string
): Promise<{ token: string; user: { id: string; displayName: string; providers: string[] } }> {
  const client = new SignalingClient(sessionServerUrl);
  const response = await client.authGitHubCallback({
    code,
    redirect_uri: redirectUri,
  });
  return { token: response.token, user: response.user };
}

export function validateOAuthState(state: string): boolean {
  const stored = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  return stored === state;
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;

    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof decoded.exp !== 'number') return true;

    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function getOAuthParamsFromUrl(): {
  code: string;
  state: string;
} | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (!code || !state) return null;
  return { code, state };
}
