# Production Deployment Checklist

Quick reference for deploying peer-plan to production.

---

## Prerequisites

- [x] GitHub OAuth App created: `Ov23liNnbDyIs6wu4Btd`
- [ ] Cloudflare account with Workers enabled
- [ ] Custom domain (optional, can use `*.pages.dev`)

---

## 1. GitHub OAuth App Configuration

Go to: https://github.com/settings/developers → "Peer-Plan"

**Update callback URLs to include production:**
```
http://localhost:5173             ← Local
https://peer-plan.pages.dev       ← Production (or your domain)
```

**Client ID:** `Ov23liNnbDyIs6wu4Btd` (already created)
**Client Secret:** Keep secure, needed for worker deployment

---

## 2. Deploy GitHub OAuth Worker

### Option A: GitHub Action (Automatic)

**Set repository secrets at:** https://github.com/SchoolAI/peer-plan/settings/secrets/actions

Add:
- `CLOUDFLARE_API_TOKEN` - From Cloudflare dashboard → My Profile → API Tokens
- `CLOUDFLARE_ACCOUNT_ID` - From Cloudflare dashboard → Workers → Overview
- `GITHUB_CLIENT_ID` - `Ov23liNnbDyIs6wu4Btd`
- `GITHUB_CLIENT_SECRET` - From GitHub OAuth App settings

**Push to main:**
```bash
git push origin main
```

GitHub Action auto-deploys worker to: `https://peer-plan-github-oauth.jacob-191.workers.dev`

### Option B: Manual Deployment

```bash
cd apps/github-oauth-worker

# Login to Cloudflare
npx wrangler login

# Set secrets (one-time)
pnpm secret:client-id      # Enter: Ov23liNnbDyIs6wu4Btd
pnpm secret:client-secret  # Enter: your_client_secret

# Deploy
pnpm deploy
```

**Verify deployment:**
```bash
curl https://peer-plan-github-oauth.jacob-191.workers.dev/health
# Should return: OK
```

---

## 3. Deploy Web App

### Configure Production Environment

**Create:** `apps/web/.env.production`

```bash
VITE_GITHUB_CLIENT_ID=Ov23liNnbDyIs6wu4Btd
VITE_GITHUB_OAUTH_WORKER=https://peer-plan-github-oauth.jacob-191.workers.dev
VITE_WEBRTC_SIGNALING=wss://peer-plan-signaling.jacob-191.workers.dev
```

### Build and Deploy

**GitHub Pages:**
```bash
cd apps/web
pnpm build

# Deploy dist/ to GitHub Pages
# (Add GitHub Action or manual gh-pages push)
```

**Cloudflare Pages:**
```bash
# Via Cloudflare dashboard:
# - Connect GitHub repo
# - Build command: cd apps/web && pnpm build
# - Output directory: apps/web/dist
# - Environment variables: (copy from .env.production)
```

**Netlify/Vercel:**
```bash
# Similar - build command: cd apps/web && pnpm build
# Output: apps/web/dist
# Environment variables from .env.production
```

---

## 4. MCP Server (No Deployment Needed)

MCP server runs locally on each user's machine. Users install it via:

```bash
# Add to their .mcp.json
{
  "mcpServers": {
    "peer-plan": {
      "command": "node",
      "args": ["/path/to/peer-plan/apps/server/dist/index.mjs"]
    }
  }
}
```

No central deployment - it's peer-to-peer!

---

## 5. WebRTC Signaling Server

Already deployed at: `wss://peer-plan-signaling.jacob-191.workers.dev`

**To update:**
```bash
cd apps/signaling
npx wrangler deploy
```

---

## Testing Production

### After All Deployments:

**1. Test OAuth Worker:**
```bash
curl https://peer-plan-github-oauth.jacob-191.workers.dev/health
# Returns: OK
```

**2. Test Web App:**
```
Open: https://peer-plan.pages.dev
Click "Sign in with GitHub"
Authorize
Should redirect back and log you in
```

**3. Test Plan Creation:**
```bash
# On your local machine with MCP
# Create a plan
# Share URL: https://peer-plan.pages.dev/plan/xyz
# Open in different browser/device
# Should work!
```

---

## Environment-Specific Behavior

| Feature | Local | Production |
|---------|-------|------------|
| **OAuth Worker** | `localhost:4445` | `peer-plan-github-oauth.jacob-191.workers.dev` |
| **WebRTC Signaling** | `localhost:4444` | `peer-plan-signaling.jacob-191.workers.dev` |
| **Web App** | `localhost:5173` | `peer-plan.pages.dev` |
| **Callback URL** | `localhost:5173` | `peer-plan.pages.dev` |
| **MCP Server** | Local (user's machine) | Local (user's machine) |

**Same OAuth App works for both** because we configured multiple callback URLs!

---

## GitHub Secrets Needed

For GitHub Actions to auto-deploy:

```
Repository → Settings → Secrets and variables → Actions

Add:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID
- GITHUB_CLIENT_ID (Ov23liNnbDyIs6wu4Btd)
- GITHUB_CLIENT_SECRET (from OAuth App)
```

---

## Monitoring

**Worker Logs:**
```bash
cd apps/github-oauth-worker
pnpm tail

# Or via dashboard:
# https://dash.cloudflare.com → Workers → peer-plan-github-oauth → Logs
```

**Worker Metrics:**
- Requests per second
- Error rate
- Response time

---

*Created: 2026-01-08*
