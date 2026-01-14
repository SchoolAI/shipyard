# Peer-Plan Setup

Quick start guide for running peer-plan locally.

---

## Prerequisites

- Node.js >= 22.14.0
- pnpm >= 10.9.0
- Claude Code CLI

---

## Installation

```bash
cd /Users/jacobpetterle/Working\ Directory/peer-plan
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
claude mcp add --transport stdio peer-plan \
  -- node "/Users/jacobpetterle/Working Directory/peer-plan/apps/server/dist/index.mjs"
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

**Before running:** Close ALL peer-plan browser tabs (regular AND incognito). Open tabs block IndexedDB deletion.

**Limitation:** If remote P2P peers are connected, they'll re-sync data back. This reset is for local development only.

```bash
pnpm reset
```

This command:
1. Kills all peer-plan processes (MCP servers, registry, signaling, Vite)
2. Clears server-side LevelDB storage (`~/.peer-plan/plans/`)
3. Opens browser to clear IndexedDB + localStorage

### Browser-Only Reset (Dev Mode)

If you only need to clear browser storage:

**Option 1: URL parameter**
```
http://localhost:5173/?reset=all
```

**Option 2: Console**
```javascript
window.__resetPeerPlan()
```

Both options only work in development mode.

### Manual Reset

If the script doesn't work:

```bash
# 1. Kill all processes
pkill -f "peer-plan"

# 2. Clear server storage
rm -rf ~/.peer-plan/plans/

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

*Last updated: 2026-01-13*
