# Shipyard Development Setup

Developer guide for running Shipyard locally and contributing to the codebase.

> **Note:** For end-user installation (Claude Code plugin or npm package), see [INSTALLATION.md](./INSTALLATION.md).

---

## Prerequisites

- Node.js >= 22.14.0
- pnpm >= 10.9.0
- Claude Code CLI

---

## Important: Don't Install the Plugin for Local Dev

**Do NOT install the `shipyard` plugin if you're developing this codebase.**

The plugin is for end users only. When developing locally:
- ✅ Use project hooks (`./hooks/hooks.json`)
- ✅ Use project skills (`./skills/shipyard/`)
- ✅ Use project MCP (`./.mcp.json`)

**Why not both?**
- Plugin hooks + project hooks run in parallel (duplicate triggers)
- Can't disable local hooks (they always load from the project)
- Causes confusion about which code is executing

**If you already installed it:**
```bash
/plugin uninstall shipyard@schoolai-shipyard
```

---

## Installation

```bash
cd /Users/jacobpetterle/Working\ Directory/Shipyard
pnpm install
pnpm build
```

---

## Running the App

**Just run:**
```bash
pnpm dev:all
```

This starts all services:
- Web UI on `http://localhost:5173`
- MCP server with hot reload (auto-restarts on code changes)
- Signaling server, OAuth worker, OG proxy
- Auto-configures unique ports if running in a feature worktree

**Parallel worktrees?** No setup needed - just run `pnpm dev:all` in each worktree. Auto-detects branch and assigns unique ports.

### Testing the MCP

Verify the MCP is available in Claude Code:

```bash
# In Claude Code:
/mcp
# Should see "shipyard MCP" under Project MCPs
```

Test creating a task:
```
"Create an implementation plan for adding user authentication"
```

Browser should open with the task.

---

## Agent Launcher Daemon

The daemon enables browser → agent triggering. Click "+ Create Task" in Shipyard UI to launch Claude Code on your machine.

### How It Works

**Self-propagating bootstrap:**
1. First Claude Code session with Shipyard MCP
2. MCP auto-spawns daemon (detached process)
3. Daemon survives when Claude Code exits
4. Browser can trigger new Claude Code sessions

**Ports:** 56609 (primary), 49548 (fallback)
**Lock file:** `~/.shipyard/daemon.lock`

### Manual Control

```bash
# Start daemon manually
npx shipyard

# Check if running
curl http://localhost:56609/health

# Stop daemon
pkill -f "shipyard/apps/daemon"

# Or kill via PID from lock file
kill $(cat ~/.shipyard/daemon.lock | head -1)
```

### Troubleshooting

**Daemon not starting:**
- Check lock file: `cat ~/.shipyard/daemon.lock`
- Check for stale lock (process dead): `ps aux | grep <PID>`
- Remove stale lock: `rm ~/.shipyard/daemon.lock`

**Port conflicts:**
- Daemon tries ports [56609, 49548] with automatic fallback
- If both in use, daemon won't start

**Browser can't connect:**
- Verify daemon running: `curl http://localhost:56609/health`
- Check browser console for WebSocket errors
- Ensure no firewall blocking localhost connections

---

## Local Hooks Setup

**For testing hook changes locally (without installing the plugin).**

Similar to MCP, hooks need different configuration for local dev vs distribution:
- **Distribution**: `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` (plugin install)
- **Local Dev**: `~/.claude/settings.json` points to your local build

### Quick Setup

```bash
# 1. Switch to local development hooks
./scripts/setup-hooks-dev.sh

# 2. RESTART Claude Code (required!)
#    Close and reopen Claude Code to pick up settings changes

# 3. Make changes, rebuild
vim apps/hook/src/adapters/claude-code.ts
pnpm --filter @shipyard/hook build

# 4. Switch back to production when done
./scripts/restore-hooks-prod.sh
```

**⚠️ Important:** You MUST restart Claude Code after running `setup-hooks-dev.sh`. Claude Code reads `~/.claude/settings.json` on startup - changes aren't picked up while running.

### What Gets Configured

The setup script updates your `~/.claude/settings.json` to use local builds:

**Hooks configured:**
- `PreToolUse` → `AskUserQuestion` - Blocks built-in prompt, redirects to `requestUserInput()` in `execute_code`
- `PermissionRequest` → `ExitPlanMode` - Handles plan approval (30min timeout)
- `PostToolUse` → `ExitPlanMode` - Injects session context after approval
- `SessionStart` - Loads project context

**Before (production):**
```json
{
  "hooks": {
    "PermissionRequest": [{
      "hooks": [{"command": "shipyard-hook"}]
    }]
  }
}
```

**After (local dev):**
```json
{
  "hooks": {
    "PermissionRequest": [{
      "hooks": [{"command": "node /Users/.../shipyard/apps/hook/dist/index.js"}]
    }]
  }
}
```

### Requirements

- `jq` must be installed: `brew install jq`

### Troubleshooting Hooks

**Hooks not firing?**

1. Check if hook is built:
   ```bash
   ls -la apps/hook/dist/index.js
   ```

2. Check settings file points to local build:
   ```bash
   grep "shipyard" ~/.claude/settings.json
   ```

3. Check hook logs (path varies if using worktrees):
   ```bash
   tail -f ~/.shipyard/hook-debug.log
   # or $SHIPYARD_STATE_DIR/hook-debug.log if using worktrees
   ```

4. Verify you ran the setup script:
   ```bash
   # If settings still show "shipyard-hook", run setup again
   ./scripts/setup-hooks-dev.sh
   ```

**Restore from backup manually:**

```bash
# List backups (created automatically by setup script)
ls -lt ~/.claude/settings.json.backup-*

# Restore specific backup
cp ~/.claude/settings.json.backup-1737445678 ~/.claude/settings.json
```

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

## OG Proxy Worker (Optional)

Cloudflare Worker that injects dynamic Open Graph meta tags for social media crawlers.

**When to run:** Only needed if testing social preview functionality (not required for normal development).

### Why It Exists

Static sites (GitHub Pages) serve the same HTML for all URLs. Social crawlers (Slackbot, Discord, etc.) don't execute JavaScript, so they can't see the plan title encoded in the `?d=` parameter. The worker decodes the URL and returns HTML with dynamic OG tags.

### How It Works

- **Crawlers** get HTML with dynamic OG tags (title, description, status)
- **Regular users** get proxied to GitHub Pages (prod) or localhost:5173 (dev)

### Running Locally

```bash
# Start the worker (port 4446)
pnpm dev:og-proxy

# In another terminal, test with a crawler User-Agent
curl -H "User-Agent: Slackbot" "http://localhost:4446/?d=YOUR_ENCODED_PLAN"

# Health check
curl http://localhost:4446/health
```

### Testing

Use the included test script:

```bash
# Test local (requires worker running)
./apps/og-proxy-worker/test-worker.sh development

# Test production
./apps/og-proxy-worker/test-worker.sh production
```

### Production URL

`https://shipyard-og-proxy.jacob-191.workers.dev`

For architecture details, see `apps/og-proxy-worker/README.md`.

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
3. Open GitHub Pages: https://schoolai.github.io/shipyard/
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
http://localhost:5173/?d=N4IgdghgtgpiBcIQBoQBc...
```

### TypeScript Errors in IDE

Run build first:
```bash
pnpm build
```

The IDE needs the built `.d.mts` files from schema package.

### Port Conflicts (EADDRINUSE)

If auto-configuration doesn't resolve port conflicts, create a `.env` file:

```bash
# .env (or .env.local)
REGISTRY_PORT=32195
VITE_PORT=5176
PORT=4484
SHIPYARD_STATE_DIR=~/.shipyard-custom
```

The `dev:all` script will use these values.

---

*Last updated: 2026-01-26*
