# Shipyard Development Setup

Developer guide for running Shipyard locally and contributing to the codebase.

---

## Prerequisites

- Node.js >= 22.14.0
- pnpm >= 10.9.0
- Claude Code CLI

---

## Installation

```bash
cd path/to/shipyard
pnpm install
pnpm build
```

---

## Running Services

```bash
pnpm dev:all             # Start session server
pnpm dev:session-server  # Start session server directly
pnpm dev:og-proxy        # Start OG proxy worker (optional)
```

### Active Apps

| App | Purpose | Port |
|-----|---------|------|
| `apps/session-server/` | Auth + WebRTC signaling (CF Workers) | 4444 |
| `apps/og-proxy-worker/` | OG meta tags for social previews | 4446 |

### Packages

| Package | Purpose |
|---------|---------|
| `packages/loro-schema/` | Loro Shape definitions, typed docs, helpers |
| `packages/session/` | Session/auth shared types and client |

---

## First-Time Setup

```bash
pnpm setup
```

This runs three steps automatically:
1. **Secrets** — creates `apps/session-server/.dev.vars` with auto-generated JWT secret and shared dev OAuth client ID
2. **Database** — applies D1 migrations to local SQLite
3. **Login** — builds the daemon, starts the session server, runs `shipyard login` device flow, then stops the server

The only manual step is completing the GitHub OAuth prompt in your browser.

After setup completes, you also need to authenticate with Anthropic to run agents — see [Anthropic Authentication](#anthropic-authentication).

### Individual Commands

| Command | When to use |
|---------|------------|
| `pnpm setup` | First time cloning the repo |
| `pnpm setup:login` | Token expired (every 30 days) |
| `pnpm db:migrate` | After pulling new D1 migrations |
| `pnpm setup:secrets` | Regenerate `.dev.vars` |

---

## Daemon Authentication

> This section covers Shipyard session auth (connecting to the signaling server). For Anthropic/Claude auth needed to run agents, see [Anthropic Authentication](#anthropic-authentication) below.

The daemon requires a Shipyard identity token to connect to the session server.

### Login via Device Flow

```bash
# Start the session server first
pnpm dev:session-server

# In another terminal, run the login command
shipyard login
```

This prints a URL and code. Open the URL in your browser, sign in with GitHub, and the CLI receives a token automatically. The token is saved to `~/.shipyard/config.json` (30-day expiry).

### Auth Commands

```bash
shipyard login          # Authenticate via device flow
shipyard login --check  # Show current auth status
shipyard logout         # Clear stored credentials
```

### CI/Automation Override

Set `SHIPYARD_USER_TOKEN` as an environment variable to skip the device flow. This takes precedence over the config file.

### Token Lifecycle

- Tokens expire after 30 days
- The daemon checks expiry on startup and prints a message if expired
- Run `shipyard login` again to refresh

---

## Anthropic Authentication

The daemon needs Anthropic credentials to run Claude agents. This is separate from Shipyard session auth above — both are required for full functionality.

Auth is **per-machine**: each daemon machine has independent Anthropic auth state, visible in the browser Settings page.

### Option 1: Claude Code OAuth (recommended for local dev)

```bash
claude auth login
```

The daemon detects this automatically via `claude auth status` on startup. No additional config needed.

You can also trigger login from the browser: **Settings > Anthropic Auth > Login with Claude**. This runs `claude auth login` on the daemon machine (not in the browser) — watch your terminal or daemon logs for the OAuth URL.

### Option 2: API Key (CI/headless environments)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

If `ANTHROPIC_API_KEY` is set, it takes precedence and OAuth status is not checked.

### Verify Status

```bash
claude auth status
```

If the status shows `unknown`, Claude Code CLI may not be installed or not on your PATH.

---

## OG Proxy Worker (Optional)

Cloudflare Worker that injects dynamic Open Graph meta tags for social media crawlers.

**When to run:** Only needed if testing social preview functionality.

```bash
pnpm dev:og-proxy

# Test with a crawler User-Agent
curl -H "User-Agent: Slackbot" "http://localhost:4446/?d=YOUR_ENCODED_PLAN"
```

---

## Development Commands

```bash
pnpm check               # Run all checks (typecheck, lint, file allowlist)
pnpm build               # Build all packages
pnpm test                # Run all tests
pnpm test:meta           # Run meta-tests (verify test files exist)
pnpm lint:fix            # Auto-fix lint issues
pnpm lint:comments       # Check comment style (ESLint)
pnpm lint:typeassertions # Check type assertions (ESLint)
```

---

## Environment Variables

Session server configuration is in `apps/session-server/`. See the wrangler config for environment bindings.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (alternative to `claude auth login`) |
| `SHIPYARD_USER_TOKEN` | JWT for signaling auth (alternative to `shipyard login`) |
| `SHIPYARD_SIGNALING_URL` | Override signaling server URL |

### GitHub Authentication

For features requiring GitHub access:

```bash
# Option 1: Use gh CLI (recommended)
gh auth login

# Option 2: Set explicit token
export GITHUB_TOKEN=ghp_your_token_here
```

---

## Resetting Data

CRDTs make reset hard — peers re-sync old data. Shipyard uses epoch numbers to force all clients to clear storage simultaneously.

### Epoch Reset

```bash
SHIPYARD_EPOCH=2 pnpm dev:all
```

All clients with epoch < 2 are rejected with close code 4100. Client clears storage and reconnects with the new epoch.

**When to use:**
- You want to completely clear all data everywhere
- Multiple browser tabs or P2P peers connected
- Normal reset isn't clearing data

### Manual Reset

```bash
# Clear server storage
rm -rf ~/.shipyard/plans/

# Clear browser storage (in DevTools)
# Application → Storage → Clear site data
```

---

## Troubleshooting

### TypeScript Errors in IDE

Run build first — the IDE needs built `.d.mts` files from packages:
```bash
pnpm build
```

### Port Conflicts

Override ports with environment variables:
```bash
PORT=4445 pnpm dev:all
```

---

*Last updated: 2026-02-20*
