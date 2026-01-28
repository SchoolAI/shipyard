/**
 * Cloudflare Worker for GitHub OAuth token exchange
 *
 * Proxies OAuth code-for-token exchange because:
 * 1. GitHub's token endpoint doesn't support CORS
 * 2. Client secret can't be exposed in browser
 *
 * Browser flow:
 * 1. User clicks "Login with GitHub"
 * 2. GitHub redirects to app with ?code=xxx
 * 3. App POSTs code to this worker
 * 4. Worker exchanges code for token with GitHub
 * 5. Worker returns token to browser
 */

import { logger } from './logger.js';

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ENVIRONMENT: 'development' | 'production';
}

interface TokenRequest {
  code: string;
  redirect_uri: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenExchangeResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  is_mobile?: boolean;
}

/**
 * Allowed origins by environment - restrict CORS to prevent phishing attacks
 *
 * Development: Allow any localhost port for worktree flexibility
 * Production: Strict whitelist
 */
const ALLOWED_ORIGINS_PRODUCTION = ['https://shipyard.pages.dev', 'https://schoolai.github.io'];

function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) {
    return false;
  }

  if (env.ENVIRONMENT === 'production') {
    return ALLOWED_ORIGINS_PRODUCTION.includes(origin);
  }

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function getCorsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  if (!isAllowedOrigin(origin, env)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Detects if the User-Agent header indicates a mobile device
 * Used to prevent deep linking to desktop apps during OAuth on mobile
 */
function isMobileUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Android/i.test(userAgent);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin, env);

    // NOTE: No CORS required - this is for monitoring, not browser calls
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'OK', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!corsHeaders) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname !== '/token-exchange') {
      return new Response(
        JSON.stringify({
          status: 'GitHub OAuth token exchange proxy',
          version: '1.0.0',
          endpoint: 'POST /token-exchange',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      logger.error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: TokenRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { code, redirect_uri } = body;

    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'shipyard-oauth-worker',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri,
        }),
      });

      const data: GitHubTokenResponse = await response.json();

      if (data.error) {
        logger.error(
          { error: data.error, description: data.error_description },
          'GitHub OAuth error'
        );
        return new Response(
          JSON.stringify({
            error: data.error,
            error_description: data.error_description,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // NOTE: Check if request is from mobile device for deep linking prevention
      const userAgent = request.headers.get('User-Agent') || '';
      const isMobile = isMobileUserAgent(userAgent);

      const responseBody: TokenExchangeResponse = {
        access_token: data.access_token,
        token_type: data.token_type,
        scope: data.scope,
        ...(isMobile && { is_mobile: true }),
      };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error({ error }, 'Token exchange failed');
      return new Response(JSON.stringify({ error: 'Token exchange failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
