# Shipyard Installation Guide

Complete installation instructions for all AI platforms.

---

## Claude Code (Recommended)

**Method:** GitHub plugin (two-step install)

```bash
# Step 1: Add the Shipyard marketplace
/plugin marketplace add SchoolAI/shipyard

# Step 2: Install the plugin from the marketplace
/plugin install shipyard@schoolai-shipyard
```

> **Why two steps?** Claude Code uses a marketplace model (like app stores). You first register a marketplace (catalog of plugins), then install specific plugins from it. This is intentional design for security and control.

**Troubleshooting:** If Step 1 fails with a cache error (known bug #14696 with case-sensitive org names), try:
```bash
/plugin marketplace add https://github.com/SchoolAI/shipyard.git
```
If that stalls, start a fresh Claude Code session and retry.

**What you get:**
- ✅ MCP server with all tools (`create_plan`, `read_plan`, `add_artifact`, etc.)
- ✅ Automatic hooks (plan creation on `ExitPlanMode`, session tracking)
- ✅ Skills for collaborative planning workflows

**Verification:**

```bash
# Check plugin installed
/plugin list

# Check skills available
/shipyard

# Create a test plan
[Enter plan mode with Shift+Tab, write plan, exit]
# Hook should trigger, browser should open
```

---

## Other Platforms (MCP Server Only)

For platforms that don't support hooks (Cursor, Windsurf, Replit, Copilot, etc.), install the MCP server via npm.

### Cursor

**Configuration:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp", "mcp-server-shipyard"]
    }
  }
}
```

**Verification:**

1. Restart Cursor
2. Open MCP panel
3. Check "shipyard" server is connected
4. Test tool availability (MCP tools should show `create_plan`, etc.)

### Windsurf

**Configuration:** `~/.windsurf/settings.json`

```json
{
  "mcp.servers": {
    "shipyard": {
      "command": "npx @schoolai/shipyard-mcp mcp-server-shipyard"
    }
  }
}
```

**Note:** Windsurf has a 100-tool limit - Shipyard uses ~10 tools.

### Replit Agent

**Configuration:** `.replit.mcp.json` in your project

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["@schoolai/shipyard-mcp", "mcp-server-shipyard"]
    }
  }
}
```

### GitHub Copilot

**Configuration:** VS Code settings (`settings.json`)

```json
{
  "github.copilot.chat.mcp.servers": {
    "shipyard": {
      "command": "npx",
      "args": ["@schoolai/shipyard-mcp", "mcp-server-shipyard"]
    }
  }
}
```

### Gemini Code Assist

**Configuration:** Gemini settings

```json
{
  "mcp": {
    "servers": {
      "shipyard": {
        "command": "npx @schoolai/shipyard-mcp mcp-server-shipyard"
      }
    }
  }
}
```

---

## Environment Variables

All platforms support environment variables in MCP configuration:

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["@schoolai/shipyard-mcp", "mcp-server-shipyard"],
      "env": {
        "GITHUB_TOKEN": "your-github-pat",
        "SHIPYARD_WEB_URL": "https://your-shipyard-instance.github.io",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Available Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GITHUB_TOKEN` | Optional | - | For artifact uploads (public repos work without it) |
| `SHIPYARD_WEB_URL` | Optional | `http://localhost:5173` | URL to open plans in browser |
| `LOG_LEVEL` | Optional | `info` | Logging level (debug, info, warn, error) |
| `REGISTRY_PORT` | Optional | `32191` | Multi-instance coordination port |
| `SHIPYARD_STATE_DIR` | Optional | `~/.shipyard` | Persistent storage location |

---

## Troubleshooting

### MCP Server Won't Start

**Error:** `Cannot find module '@shipyard/schema'`
- **Cause:** Workspace dependencies not bundled (should not happen with v0.1.0+)
- **Fix:** Update to latest version: `npx @schoolai/shipyard-mcp@latest mcp-server-shipyard`

**Error:** `EADDRINUSE` (port already in use)
- **Cause:** Another Shipyard instance running
- **Fix:** Stop other instances or set different `REGISTRY_PORT` in env vars

### Browser Won't Open

**Issue:** Plan created but no browser launched

- **Check:** `SHIPYARD_WEB_URL` env var is set correctly
- **Check:** Browser is installed and accessible
- **Manual:** Copy the URL from MCP tool response and open manually

### Artifacts Won't Upload

**Error:** `GitHub API rate limit exceeded`
- **Solution:** Add `GITHUB_TOKEN` to env vars (increases limit to 5000/hour)

**Error:** `403 Forbidden` on artifact upload
- **Cause:** No write permissions to repo
- **Fix:** Ensure `GITHUB_TOKEN` has `repo` scope

### Sync Issues

**Issue:** Changes not syncing between peers

1. **Check registry server:** Should see "Connected to registry hub" in logs
2. **Check WebRTC:** Browser should show "X P2P peers connected"
3. **Check signaling:** Default is `ws://localhost:4444` - ensure signaling server is running

**Manual test:**
```bash
# Start signaling server
pnpm dev --filter @shipyard/signaling

# Then start MCP server
pnpm dev --filter @shipyard/server
```

---

## Platform Capabilities Comparison

| Platform | MCP | Hooks | Session Tracking | Distribution |
|----------|-----|-------|------------------|--------------|
| **Claude Code** | ✅ | ✅ (8 events) | ✅ session_id | GitHub plugin |
| **Cursor** | ✅ | ⚠️ Limited | ⚠️ Manual | npm + manual hook (future) |
| **Windsurf** | ✅ | ⚠️ Unknown | ❌ | npm only |
| **Replit** | ✅ | ❌ | ❌ | npm only |
| **Copilot** | ✅ | ❌ | ❌ | npm only |
| **Gemini** | ✅ | ❌ | ❌ | npm only |

**Key:** Only Claude Code gets the full experience (hooks + skills + MCP). Other platforms can use MCP tools but lack automatic workflows.

---

## Next Steps

After installation:

1. **Try creating a plan** — Ask your AI assistant to create an implementation plan
2. **Review in browser** — Plan should open automatically
3. **Invite collaborators** — Share the URL for P2P review
4. **Add artifacts** — Screenshot your work and attach to deliverables

For comprehensive usage docs, see [docs/milestones/](./milestones/) for detailed workflows.

---

## Support

- **Issues:** https://github.com/SchoolAI/shipyard/issues
- **Discussions:** https://github.com/SchoolAI/shipyard/discussions
- **Documentation:** [docs/](./docs/)

---

*Last updated: 2026-01-20*
