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
cd /Users/jacobpetterle/Working\ Directory/shipyard
pnpm install
pnpm build
```

---

## Running Services

```bash
pnpm dev:all          # Start session server
pnpm dev:session-server  # Start session server directly
pnpm dev:og-proxy     # Start OG proxy worker (optional)
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
pnpm check        # Run all checks (typecheck, lint, file allowlist)
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm test:meta    # Run meta-tests (verify test files exist)
pnpm lint:fix     # Auto-fix lint issues
pnpm lint:comments       # Check comment style (ESLint)
pnpm lint:typeassertions # Check type assertions (ESLint)
pnpm cleanup      # Kill dev processes, remove build artifacts
pnpm reset        # Nuclear reset: clear ALL data
```

---

## Environment Variables

Session server configuration is in `apps/session-server/`. See the wrangler config for environment bindings.

### GitHub Authentication

For features requiring GitHub access:

```bash
# Option 1: Use gh CLI (recommended)
gh auth login

# Option 2: Set explicit token
export GITHUB_TOKEN=ghp_your_token_here
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

*Last updated: 2026-02-11*
