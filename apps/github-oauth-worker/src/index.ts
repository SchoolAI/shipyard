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
  ENVIRONMENT: string;
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

// Allowed origins by environment - restrict CORS to prevent phishing attacks
const ALLOWED_ORIGINS: Record<string, string[]> = {
  development: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ],
  production: ['https://peer-plan.pages.dev', 'https://schoolai.github.io'],
};

function getCorsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  const allowedOrigins = ALLOWED_ORIGINS[env.ENVIRONMENT] || ALLOWED_ORIGINS.production;
  const isAllowed = origin && allowedOrigins.includes(origin);

  // Return null for unauthorized origins - caller should reject the request
  if (!isAllowed) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const corsHeaders = getCorsHeaders(origin, env);

    // Health check endpoint - includes environment for deployment verification
    // No CORS required - this is for monitoring, not browser calls
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'OK', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reject unauthorized origins before processing any request
    if (!corsHeaders) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST to /token-exchange
    if (url.pathname !== '/token-exchange') {
      return new Response(
        JSON.stringify({
          status: 'GitHub OAuth token exchange proxy',
          version: '1.0.0',
          endpoint: 'POST /token-exchange',
        }),
        {
          status: 200,
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

    // Validate environment secrets are configured
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      logger.error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
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

    // Exchange code for token with GitHub
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'peer-plan-oauth-worker',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri,
        }),
      });

      const data: GitHubTokenResponse = await response.json();

      // GitHub returns 200 even on errors, check for error field
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

      // Return token to browser
      return new Response(
        JSON.stringify({
          access_token: data.access_token,
          token_type: data.token_type,
          scope: data.scope,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      logger.error({ error }, 'Token exchange failed');
      return new Response(JSON.stringify({ error: 'Token exchange failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
