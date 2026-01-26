# Shipyard OG Proxy Worker

Cloudflare Worker that injects dynamic Open Graph meta tags for Shipyard plan URLs.

## Problem

When sharing Shipyard plan URLs (e.g., `https://shipyard.dev/?d=ABC123...`) on platforms like GitHub, Slack, or Discord, the social preview shows generic "Shipyard" branding instead of the actual plan title and status.

This happens because:
1. Plan data is encoded in the URL's `?d=` parameter
2. Social crawlers don't execute JavaScript
3. GitHub Pages serves the same static HTML for all URLs

## Solution

This worker sits in front of the static site and:
1. Detects crawler User-Agents (Slackbot, Twitterbot, etc.)
2. Decodes the lz-string compressed plan data from `?d=`
3. Returns HTML with dynamic OG tags specific to that plan
4. Regular users are proxied directly to the static site

## What Gets Shown

| Field | Source |
|-------|--------|
| `og:title` | Plan title from URL data |
| `og:description` | Status + deliverable count + content excerpt |
| `og:image` | Static Shipyard image (for now) |

Example preview:
```
┌─────────────────────────────────────────┐
│ 🖼️ [Shipyard Logo]                      │
│                                         │
│ Add User Authentication                 │
│ ✅ Completed · 3 deliverables · oauth2  │
│ shipyard.dev                            │
└─────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
pnpm install

# Run locally (proxies to localhost:5173 by default)
pnpm dev

# Test with curl (simulating a crawler)
curl -H "User-Agent: Slackbot" "http://localhost:4446/?d=YOUR_ENCODED_PLAN"

# Test health endpoint
curl http://localhost:4446/health
```

## Deployment

```bash
# Deploy to Cloudflare
pnpm deploy
```

## Configuration

Environment variables in `wrangler.toml`:

| Variable | Description |
|----------|-------------|
| `UPSTREAM_URL` | Where to proxy non-crawler requests |
| `CANONICAL_BASE_URL` | Base URL for OG tags (what users see) |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Social      │────►│ OG Proxy Worker  │────►│ GitHub Pages    │
│ Crawler     │     │                  │     │ (static site)   │
└─────────────┘     │ 1. Detect UA     │     └─────────────────┘
                    │ 2. Decode ?d=    │
                    │ 3. Inject OG     │
                    └──────────────────┘
                           │
                           ▼
                    Return HTML with
                    dynamic OG tags
```

## Supported Crawlers

- Slackbot
- Twitterbot / X
- facebookexternalhit
- LinkedInBot
- Googlebot
- Discordbot
- WhatsApp
- TelegramBot
- And more...

## Limitations

- **No dynamic OG image**: The preview image is static. Dynamic image generation would require an additional service.
- **Snapshot data only**: Only data encoded in the URL is available. Live CRDT data is not accessible.
- **No artifacts**: Artifact images/videos stored in GitHub are not embedded (would require additional fetches).
