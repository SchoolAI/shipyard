# GitHub OAuth Worker

Cloudflare Worker that proxies GitHub OAuth token exchange for browser clients.

## Why This Exists

Browsers cannot directly call GitHub's OAuth token endpoint because:
1. `https://github.com/login/oauth/access_token` does not support CORS
2. Client secret is required and cannot be exposed in browser code

This worker securely holds the client secret and proxies the token exchange.

## OAuth Flow

```
Browser                    Worker                    GitHub
   |                         |                         |
   |  1. User clicks login   |                         |
   |  2. Redirect to GitHub  |                         |
   |------------------------>|------------------------>|
   |                         |                         |
   |  3. User authorizes     |                         |
   |<------------------------|<------------------------|
   |     ?code=abc123        |                         |
   |                         |                         |
   |  4. POST /token-exchange|                         |
   |    { code, redirect_uri}|                         |
   |------------------------>|                         |
   |                         |  5. POST /access_token  |
   |                         |   + client_secret       |
   |                         |------------------------>|
   |                         |                         |
   |                         |  6. { access_token }    |
   |                         |<------------------------|
   |                         |                         |
   |  7. { access_token }    |                         |
   |<------------------------|                         |
```

## API

### `POST /token-exchange`

Exchange an authorization code for an access token.

**Request:**
```json
{
  "code": "abc123...",
  "redirect_uri": "http://localhost:5173"
}
```

**Response (success):**
```json
{
  "access_token": "ghp_...",
  "token_type": "bearer",
  "scope": "repo user"
}
```

**Response (error):**
```json
{
  "error": "bad_verification_code",
  "error_description": "The code passed is incorrect or expired."
}
```

### `GET /health`

Health check endpoint. Returns `OK`.

## Local Development

```bash
# Install dependencies
pnpm install

# Set secrets for local dev (stored in .dev.vars)
echo "GITHUB_CLIENT_ID=your_client_id" >> .dev.vars
echo "GITHUB_CLIENT_SECRET=your_client_secret" >> .dev.vars

# Start dev server on http://localhost:4445
pnpm dev
```

Test with curl:
```bash
curl -X POST http://localhost:4445/token-exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code","redirect_uri":"http://localhost:5173"}'
```

## Production Deployment

### One-Time Setup

**1. Create GitHub OAuth App:**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - Application name: `peer-plan`
   - Homepage URL: `https://peer-plan.pages.dev` (or your domain)
   - Authorization callback URL: `https://peer-plan.pages.dev` (must match exactly)
4. Click "Register application"
5. Copy Client ID
6. Click "Generate a new client secret" and copy it immediately

**2. Login to Cloudflare:**

```bash
npx wrangler login
```

**3. Set Secrets:**

```bash
# Interactive prompts for secret values
pnpm secret:client-id
# Paste your GitHub Client ID

pnpm secret:client-secret
# Paste your GitHub Client Secret
```

Or non-interactively:
```bash
echo "your_client_id" | npx wrangler secret put GITHUB_CLIENT_ID
echo "your_client_secret" | npx wrangler secret put GITHUB_CLIENT_SECRET
```

### Deploy

```bash
# Deploy to Cloudflare Workers
pnpm deploy

# Or deploy to production environment
pnpm deploy:production
```

**Deployed URL:** `https://peer-plan-github-oauth.jacob-191.workers.dev`

### Monitoring

```bash
# View live logs
pnpm tail
```

Dashboard: [Cloudflare Workers](https://dash.cloudflare.com) -> peer-plan-github-oauth -> Metrics

## Security Notes

- Client secret is stored as a Cloudflare secret (encrypted at rest)
- CORS allows all origins (`*`) - tokens are short-lived and user-specific
- Worker logs errors but never logs secrets or tokens
- No data is stored - stateless request/response only

## GitHub Actions (Optional)

To auto-deploy on push to main, add to `.github/workflows/deploy-github-oauth.yml`:

```yaml
name: Deploy GitHub OAuth Worker

on:
  push:
    branches: [main]
    paths:
      - 'apps/github-oauth-worker/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm --filter github-oauth-worker deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Required GitHub Secret: `CLOUDFLARE_API_TOKEN` (with Workers Scripts Edit permission)
