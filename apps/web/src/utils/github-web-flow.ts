import { z } from 'zod';

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23liNnbDyIs6wu4Btd';

const WORKER_URL = (() => {
  if (import.meta.env.VITE_GITHUB_OAUTH_WORKER) {
    return import.meta.env.VITE_GITHUB_OAUTH_WORKER;
  }
  if (import.meta.env.MODE === 'production') {
    return 'https://shipyard-signaling.jacob-191.workers.dev';
  }
  return 'http://localhost:4444';
})();

const OAuthErrorResponseSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const TokenExchangeResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
  }),
  is_mobile: z.boolean().optional(),
});

const GitHubUserSchema = z.object({
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string(),
});

export type GitHubUser = z.infer<typeof GitHubUserSchema>;

export function startWebFlow(
  redirectUri: string,
  options: {
    forceAccountPicker?: boolean;
    scope?: string;
    forceConsent?: boolean;
  } = {}
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

  if (forceConsent && scope) {
    params.append('prompt', 'consent');
  }

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

export type TokenExchangeResponse = z.infer<typeof TokenExchangeResponseSchema>;

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

  const response = await fetch(`${WORKER_URL}/auth/github/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });

  if (!response.ok) {
    const rawError: unknown = await response.json();
    const errorResult = OAuthErrorResponseSchema.safeParse(rawError);
    const error = errorResult.success ? errorResult.data : { error: 'Unknown error' };
    throw new Error(error.error_description || error.error || 'Token exchange failed');
  }

  const rawData: unknown = await response.json();
  const result = TokenExchangeResponseSchema.safeParse(rawData);
  if (!result.success) {
    throw new Error('Invalid token exchange response from OAuth server');
  }
  return result.data;
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
    throw new TokenValidationError(`Failed to fetch user info: ${response.status}`, false);
  }

  const rawData: unknown = await response.json();
  const result = GitHubUserSchema.safeParse(rawData);
  if (!result.success) {
    throw new TokenValidationError('Invalid user data from GitHub API', false);
  }
  return result.data;
}

export type TokenValidationResult =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

/**
 * Validate a Shipyard JWT token by decoding and checking expiration.
 * Note: This is a client-side validation only - it checks structure and expiry
 * but cannot verify the signature (we don't have the secret).
 */
export async function validateToken(token: string): Promise<TokenValidationResult> {
  try {
    const claims = decodeShipyardJWT(token);
    if (!claims) {
      return { status: 'invalid' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      return { status: 'invalid' };
    }

    return { status: 'valid' };
  } catch {
    return { status: 'invalid' };
  }
}

const ShipyardJWTClaimsSchema = z.object({
  sub: z.string(),
  ghUser: z.string(),
  ghId: z.number(),
  iat: z.number(),
  exp: z.number(),
  scope: z.string().optional(),
  machineId: z.string().optional(),
});

type ShipyardJWTClaims = z.infer<typeof ShipyardJWTClaimsSchema>;

function decodeShipyardJWT(token: string): ShipyardJWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadB64 = parts[1];
    if (!payloadB64) return null;

    const decoded: unknown = JSON.parse(base64UrlDecode(payloadB64));
    const parseResult = ShipyardJWTClaimsSchema.safeParse(decoded);
    return parseResult.success ? parseResult.data : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return atob(base64);
}

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
