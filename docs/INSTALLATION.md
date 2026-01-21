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

**Enable auto-updates:** After installing, run `/plugin` → Marketplaces tab → select `schoolai-shipyard` → "Enable auto-update" to receive updates automatically.

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

## Platform Compatibility Matrix

### Feature Support Overview

| Platform | MCP Support | Plan Mode | Hooks/Events | Artifact Upload | Real-time Sync | P2P Collaboration | Status |
|----------|------------|-----------|--------------|-----------------|----------------|-------------------|--------|
| **Claude Code** | ✅ Full | ✅ Native | ✅ 8 events | ✅ Full | ✅ Full | ✅ Full | ✅ Production |
| **OpenCode** | ✅ Full | ✅ Native (Tab) | ⚠️ Unknown | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Testing needed |
| **Cursor** | ✅ Full | ❌ No | ⚠️ Limited | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Manual workflow |
| **Windsurf** | ✅ Full | ❌ No | ⚠️ Limited | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Testing needed |
| **Devin** | ✅ Full | ❌ No | ❌ None | ✅ Via MCP | ✅ Full | ⚠️ API-only | ⚠️ Manual session |
| **Replit Agent** | ✅ Full | ❌ No | ❌ None | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Basic MCP only |
| **GitHub Copilot** | ✅ Full | ❌ No | ❌ None | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Basic MCP only |
| **Gemini Code Assist** | ✅ Full | ❌ No | ❌ None | ✅ Via MCP | ✅ Full | ✅ Full | ⚠️ Basic MCP only |
| **Codex (OpenAI)** | ❓ Unknown | ❓ Unknown | ❌ None | ❓ Unknown | ❓ Unknown | ❓ Unknown | ❓ Research needed |

### Platform Details

#### Claude Code (✅ Full Support)
- **Installation:** GitHub plugin via `/plugin install SchoolAI/shipyard`
- **Plan Mode:** Native integration with EnterPlanMode/ExitPlanMode hooks
- **Hooks:** 8 event types (SessionStart, EnterPlanMode, Write, ExitPlanMode, etc.)
- **Session Tracking:** Automatic with session_id + transcript_path
- **Workflow:** Fully automatic - Shift+Tab creates plans, browser opens, approval flow
- **Auto-update:** Built-in via plugin system

#### OpenCode (⚠️ Testing Needed)
- **Installation:** npm + config (`~/.config/opencode/opencode.json`)
- **Plan Mode:** Native Tab-toggle plan mode
- **Hooks:** Unknown - needs investigation if OpenCode exposes plan mode events
- **Session Tracking:** TBD
- **Workflow:** Manual - use MCP tools directly
- **Status:** MCP server works, but plan mode integration needs testing (see issue #26)

#### Cursor (⚠️ Manual Workflow)
- **Installation:** npm + manual JSON config (`~/.cursor/mcp.json`)
- **Hooks:** Limited - `beforeMCPExecution` hook available for session capture
- **Session Tracking:** Manual - conversation_id + generation_id
- **Workflow:** Manual - user must call `create_plan` MCP tool explicitly
- **Limitation:** No automatic plan creation on approval workflow

#### Windsurf (⚠️ Testing Needed)
- **Installation:** npm + manual JSON config (`~/.windsurf/settings.json`)
- **Hooks:** Limited - `pre_mcp_tool_use` hook (payload structure unknown)
- **Session Tracking:** Not implemented
- **Workflow:** Manual - use MCP tools directly
- **Limitation:** 100-tool limit per config (Shipyard uses ~11 tools)

#### Devin (⚠️ Manual Session)
- **Installation:** npm only
- **Hooks:** None
- **Session Tracking:** Manual - user must provide session_id
- **Workflow:** Manual - use MCP tools directly
- **Limitation:** API-only instances cannot join P2P WebRTC mesh

#### Replit Agent, GitHub Copilot, Gemini Code Assist (⚠️ Basic MCP Only)
- **Installation:** npm + platform-specific config
- **Hooks:** None
- **Session Tracking:** None
- **Workflow:** Manual - use MCP tools directly
- **Status:** Basic functionality works, but no automatic workflows

#### Codex / OpenAI (❓ Research Needed)
- **Status:** Unknown - needs research and testing (see issue #104)
- **Expected:** Likely similar to GitHub Copilot integration
- **Priority:** P1 - feature completeness assessment in progress

### Installation Methods Summary

| Platform | Config File | Command | Auto-update |
|----------|-------------|---------|-------------|
| Claude Code | Plugin system | `/plugin install SchoolAI/shipyard` | ✅ Built-in |
| OpenCode | `~/.config/opencode/opencode.json` | Manual JSON edit | ❌ Manual |
| Cursor | `~/.cursor/mcp.json` | Manual JSON edit | ❌ Manual |
| Windsurf | `~/.windsurf/settings.json` | Manual JSON edit | ❌ Manual |
| Replit Agent | `.replit.mcp.json` | Per-project config | ❌ Manual |
| GitHub Copilot | VS Code `settings.json` | Manual JSON edit | ❌ Manual |
| Gemini Code Assist | Platform settings | Manual JSON edit | ❌ Manual |

### Key Takeaways

**✅ Full Experience (Claude Code only):**
- Automatic plan creation via hooks
- Approval workflow with blocking
- Skills for specialized tasks
- Built-in auto-update

**⚠️ MCP Tools Only (Other Platforms):**
- All MCP tools work (`create_plan`, `add_artifact`, etc.)
- Manual workflow - user must explicitly invoke tools
- No automatic plan creation or approval blocking
- Real-time sync and P2P collaboration still work
- Requires manual npm package updates

**Recommended Platform:** Claude Code for best experience. Other platforms work but require manual MCP tool invocation.

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

*Last updated: 2026-01-21*
