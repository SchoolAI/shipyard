# GitHub OAuth Worker Setup Guide

## Local vs Production Configuration

The same GitHub OAuth App can work for both local development and production by configuring **multiple callback URLs**.

---

## GitHub OAuth App Configuration

### Update Your OAuth App Settings

Go to: https://github.com/settings/developers → Click "Peer-Plan"

**Homepage URL:**
```
http://localhost:5173
```

**Authorization callback URLs:** (You can add multiple)
```
http://localhost:5173
https://peer-plan.pages.dev
https://your-custom-domain.com
```

**Enable Device Flow:** ✅ (Can keep checked, but we're using Web Flow)

---

## Local Development Setup

**1. Create `.dev.vars` file:**
```bash
cd apps/github-oauth-worker
cp .dev.vars.example .dev.vars
```

**2. Add your secrets to `.dev.vars`:**
```
GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
GITHUB_CLIENT_SECRET=your_client_secret_here
```

**3. Start worker:**
```bash
pnpm dev
```

Worker runs on: `http://localhost:4445`

**4. Configure web app:**

`apps/web/.env.development` already has:
```
VITE_GITHUB_OAUTH_WORKER=http://localhost:4445
```

**5. Test:**
```bash
# From repo root
pnpm dev:all

# Worker starts on port 4445
# Web app on port 5173
# Open http://localhost:5173
# Click "Sign in with GitHub"
# Redirects to GitHub
# Redirects back to localhost:5173
# ✅ You're logged in!
```

---

## Production Deployment

### One-Time Setup

**1. Set GitHub Secrets in Repository:**

Go to: https://github.com/SchoolAI/peer-plan/settings/secrets/actions

Add these secrets:
- `CLOUDFLARE_API_TOKEN` - Get from Cloudflare dashboard
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `GITHUB_CLIENT_ID` - `Ov23liNnbDyIs6wu4Btd`
- `GITHUB_CLIENT_SECRET` - From GitHub OAuth App settings

**2. Deploy Worker:**

The GitHub Action (`deploy-oauth-worker.yml`) auto-deploys on push to `main` when worker files change.

**Or deploy manually:**
```bash
cd apps/github-oauth-worker

# Login to Cloudflare
npx wrangler login

# Set production secrets
pnpm secret:client-id      # Enter: Ov23liNnbDyIs6wu4Btd
pnpm secret:client-secret  # Enter: your_client_secret

# Deploy
pnpm deploy
```

**3. Configure Production Web App:**

Create `apps/web/.env.production`:
```
VITE_GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
VITE_GITHUB_OAUTH_WORKER=https://peer-plan-github-oauth.jacob-191.workers.dev
```

**4. Update GitHub OAuth App:**

Add production URL to callback URLs:
```
https://peer-plan.pages.dev
```

Or your custom domain when ready.

---

## How It Works

### Local Flow
```
Browser (localhost:5173)
    |
    | 1. Redirect to GitHub OAuth
    v
GitHub.com
    |
    | 2. User authorizes
    | 3. Redirect back to localhost:5173?code=abc
    v
Browser (localhost:5173)
    |
    | 4. POST to http://localhost:4445/token-exchange
    v
Worker (localhost:4445)
    |
    | 5. Exchange code for token
    | 6. Return token
    v
Browser stores token
```

### Production Flow
```
Browser (peer-plan.pages.dev)
    |
    | 1. Redirect to GitHub OAuth
    v
GitHub.com
    |
    | 2. User authorizes
    | 3. Redirect back to peer-plan.pages.dev?code=abc
    v
Browser (peer-plan.pages.dev)
    |
    | 4. POST to https://peer-plan-github-oauth.jacob-191.workers.dev/token-exchange
    v
Worker (Cloudflare)
    |
    | 5. Exchange code for token
    | 6. Return token
    v
Browser stores token
```

**Key insight:** Same OAuth App, different callback URLs for different environments.

---

## Environment Variables Summary

### Web App (apps/web/)

**`.env.development` (local):**
```
VITE_GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
VITE_GITHUB_OAUTH_WORKER=http://localhost:4445
VITE_DISABLE_WAITING_ROOM=true  # Temporary
```

**`.env.production` (to create):**
```
VITE_GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
VITE_GITHUB_OAUTH_WORKER=https://peer-plan-github-oauth.jacob-191.workers.dev
```

### Worker (apps/github-oauth-worker/)

**`.dev.vars` (local, gitignored):**
```
GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
GITHUB_CLIENT_SECRET=your_client_secret_here
```

**Production secrets (set via wrangler or GitHub Action):**
- Stored in Cloudflare (encrypted)
- Set once, deployed automatically

---

## Troubleshooting

### "redirect_uri mismatch" Error

**Cause:** GitHub OAuth App doesn't have the callback URL configured.

**Fix:** Add URL to OAuth App settings:
- Local: `http://localhost:5173`
- Prod: `https://peer-plan.pages.dev`

### Worker Not Found (404)

**Cause:** Worker URL incorrect or worker not running.

**Fix:**
- Local: Ensure `pnpm dev` is running in `apps/github-oauth-worker`
- Prod: Check worker deployed: `npx wrangler whoami`

### CORS Error

**Cause:** Worker not setting CORS headers.

**Fix:** Already implemented in `src/index.ts` - should work. Check browser console for actual error.

---

## Testing Production Deployment

**After deploying:**

```bash
# Test the worker directly
curl -X POST https://peer-plan-github-oauth.jacob-191.workers.dev/token-exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"test","redirect_uri":"https://peer-plan.pages.dev"}'

# Should return an error (invalid code) but confirms worker is running
```

---

## Security Notes

**Client Secret:**
- NEVER commit to git
- Stored in `.dev.vars` (gitignored) for local
- Stored in Cloudflare Secrets for production
- Stored in GitHub Secrets for auto-deployment

**Client ID:**
- Safe to commit
- Public value (exposed in browser)
- In `.env.development` (committed)

---

*Last updated: 2026-01-08*
