# OG Proxy Worker Deployment Guide

## Production Deployment

**Worker URL:** `https://shipyard-og-proxy.jacob-191.workers.dev`

### What It Does

This Cloudflare Worker intercepts requests to Shipyard plan URLs and:
1. **For social crawlers** (Slackbot, Twitterbot, etc.): Returns HTML with dynamic Open Graph meta tags
2. **For regular users**: Proxies to GitHub Pages
3. **For oEmbed consumers** (Slack, Teams): Returns oEmbed JSON at `/oembed` endpoint

### How It Works

```
User shares: https://shipyard-og-proxy.jacob-191.workers.dev/?d=ABC...
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                Crawler?                         User?
                    │                               │
                    ▼                               ▼
        ┌──────────────────────┐      ┌──────────────────────┐
        │ Decode ?d= param     │      │ Proxy to:            │
        │ Extract title/status │      │ schoolai.github.io   │
        │ Return HTML with OG  │      │                      │
        └──────────────────────┘      └──────────────────────┘
```

## Manual Deployment

```bash
cd apps/og-proxy-worker
pnpm deploy
```

## CI/CD Deployment

Automatic deployment is configured via `.github/workflows/deploy-og-proxy-worker.yml`:
- Triggers on push to `main` when `apps/og-proxy-worker/**` changes
- Can be manually triggered via workflow_dispatch

## Configuration

### Production (wrangler.toml)
```toml
ENVIRONMENT = "production"
UPSTREAM_URL = "https://schoolai.github.io/shipyard"
CANONICAL_BASE_URL = "https://shipyard-og-proxy.jacob-191.workers.dev"
```

### Development
```toml
ENVIRONMENT = "development"
UPSTREAM_URL = "http://localhost:5173"  # Local web app
CANONICAL_BASE_URL = "http://localhost:4446"  # Local worker
```

## Testing

Use the included test script:

```bash
# Test production
./test-worker.sh production

# Test local (requires worker running)
pnpm dev  # In another terminal
./test-worker.sh development
```

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Health check |
| `/oembed?url=...` | oEmbed protocol endpoint for rich embeds |
| `/?d=...` | Plan URL (returns OG tags for crawlers, proxies for users) |

## What Gets Embedded

### Open Graph Preview (GitHub, Discord, etc.)
```
┌─────────────────────────────────────────┐
│ 🖼️ [Shipyard Logo]                      │
│                                         │
│ Add User Authentication                 │
│ ✅ Completed · 3 deliverables ·         │
│ SchoolAI/shipyard#42 — This plan...     │
│                                         │
│ shipyard-og-proxy.jacob-191.workers.dev │
└─────────────────────────────────────────┘
```

### oEmbed Rich Preview (Slack, Teams, Notion)

Returns JSON instructing the platform to embed an iframe:
```json
{
  "type": "rich",
  "html": "<iframe src=\"...?embed=true\" width=\"600\" height=\"400\">",
  ...
}
```

**Note:** Since Shipyard is P2P with data encoded in the URL, the iframe shows the same snapshot data as the OG preview. It's essentially a "prettier preview card with Open button" - not truly live unless peers are connected.

## URL Structure

**Shared URL:** Users share the worker URL, not GitHub Pages:
```
https://shipyard-og-proxy.jacob-191.workers.dev/?d={compressed-plan-data}
```

**Why?** The worker needs to be in the request path to inject OG tags for crawlers.

## Costs

**Free** - Cloudflare Workers free tier:
- 100,000 requests/day
- Only crawler requests decode the plan (light CPU usage)
- Regular users are just proxied through
