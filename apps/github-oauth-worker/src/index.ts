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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response('OK', {
        headers: { 'Content-Type': 'text/plain' },
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
