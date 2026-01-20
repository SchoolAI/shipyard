# Shipyard Setup

Quick start guide for running Shipyard locally.

---

## Prerequisites

- Node.js >= 22.14.0
- pnpm >= 10.9.0
- Claude Code CLI

---

## Installation

```bash
cd /Users/jacobpetterle/Working\ Directory/Shipyard
pnpm install
pnpm build
```

---

## Running the App

### 1. Start Web UI

```bash
pnpm dev:web
```

Opens on `http://localhost:5173`

### 2. Add MCP Server to Claude Code

```bash
claude mcp add --transport stdio Shipyard \
  -- node "/Users/jacobpetterle/Working Directory/Shipyard/apps/server/dist/index.mjs"
```

Verify it was added:
```bash
claude mcp list
```

### 3. Test It

Start a new Claude Code session and ask:
```
"Create an implementation plan for adding user authentication"
```

Claude will call the `create_plan` tool → browser opens with plan!

---

## Environment Variables

Each app has configurable environment variables. See the `.env.example` file in each app directory:

- `apps/server/.env.example` - MCP server configuration
- `apps/hook/.env.example` - Hook configuration
- `apps/signaling/.env.example` - Signaling server configuration

To customize:
1. Copy `.env.example` to `.env` in the app directory
2. Edit values as needed
3. Restart the app

### GitHub Authentication

For artifact uploads, the server needs a GitHub token. Priority order:

1. `GITHUB_TOKEN` environment variable (explicit override)
2. `gh auth token` CLI command (if gh is installed and authenticated)
3. null (feature gracefully disabled)

To enable artifacts:
```bash
# Option 1: Use gh CLI (recommended)
gh auth login

# Option 2: Set explicit token
export GITHUB_TOKEN=ghp_your_token_here
```

### Mobile OAuth Handling

The GitHub OAuth flow automatically detects mobile browsers (iOS Safari, Android Chrome) to prevent potential deep linking issues with desktop apps.

**How it works:**
- OAuth worker detects mobile User-Agent during token exchange
- Adds `is_mobile: true` flag to response for mobile devices
- Web app logs mobile detection in console: `[OAuth] Mobile device detected`

**Testing on mobile:**
- iOS Safari: Open app, sign in with GitHub, verify OAuth completes in browser
- Android Chrome: Same test, verify no unexpected app launches
- Check browser console for mobile detection log

**Note:** Deep linking to desktop apps during OAuth only occurs if Universal Links (iOS) or App Links (Android) are configured via `.well-known/` files on the domain. Currently, Shipyard has no such configuration, so mobile OAuth works correctly without intervention.

For more details, see [ADR-0003](./decisions/0003-mobile-oauth-user-agent-detection.md).

---

## Development Commands

```bash
pnpm check        # Run all checks (test, typecheck, lint)
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint:fix     # Auto-fix lint issues
pnpm dev:web      # Start web UI dev server
pnpm dev:server   # Start server in watch mode
pnpm cleanup      # Kill dev processes, remove build artifacts
pnpm reset        # Nuclear reset: clear ALL data (see below)
```

---

## Resetting Data

The CRDT sync means data self-heals across peers. To fully reset for testing, you need to clear both server and browser storage simultaneously.

### Nuclear Reset (Recommended)

**CRITICAL: When using Claude Code, disable MCP first:**

```bash
# In Claude Code session:
/mcp disable

# Then run reset:
pnpm reset

# After reset completes, re-enable if needed:
/mcp enable
```

**Why?** Claude Code auto-restarts the hub MCP server, causing it to re-sync data before the reset completes.

**Before running:** Close ALL Shipyard browser tabs (regular AND incognito). Open tabs block IndexedDB deletion.

**Limitation:** If remote P2P peers are connected, they'll re-sync data back. This reset is for local development only.

The reset command:
1. Kills all Shipyard processes (MCP servers, registry, signaling, Vite)
2. Clears server-side LevelDB storage (`~/.Shipyard/plans/`)
3. Opens browser to clear IndexedDB + localStorage

### Browser-Only Reset (Dev Mode)

If you only need to clear browser storage:

**Option 1: URL parameter**
```
http://localhost:5173/?reset=all
```

**Option 2: Console**
```javascript
window.__resetShipyard()
```

Both options only work in development mode.

### Production Reset (GitHub Pages)

The `?reset=all` URL parameter only works in development mode. To reset production storage:

1. Close all Shipyard browser tabs
2. Kill any local MCP servers: `pkill -f "Shipyard"`
3. Open GitHub Pages: https://schoolai.github.io/Shipyard/
4. Open DevTools → Application → Storage → **Clear site data**

### Manual Reset

If the script doesn't work:

```bash
# 1. Kill all processes
pkill -f "Shipyard"

# 2. Clear server storage
rm -rf ~/.Shipyard/plans/

# 3. Clear browser storage (in DevTools)
# Application → Storage → Clear site data
```

---

## Troubleshooting

### MCP Server Not Starting

Test the server directly:
```bash
node apps/server/dist/index.mjs
```

Should see: "MCP server started" in logs (stderr)

### Web App Not Displaying Plan

Check URL has `?d=` parameter with encoded data:
```
http://localhost:5173/plan?d=N4IgdghgtgpiBcIQBoQBc...
```

### TypeScript Errors in IDE

Run build first:
```bash
pnpm build
```

The IDE needs the built `.d.mts` files from schema package.

---

*Last updated: 2026-01-14*
