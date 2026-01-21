# Installation Guide

How to install Shipyard MCP server across different LLM clients and IDEs.

---

## Quick Start

**For Claude Code users (recommended):**
```bash
/plugin install SchoolAI/shipyard
```

**For other clients:** See client-specific instructions below.

---

## Table of Contents

1. [Claude Code](#1-claude-code)
2. [Claude Desktop](#2-claude-desktop-app)
3. [Cursor](#3-cursor)
4. [Windsurf](#4-windsurf)
5. [Zed Editor](#5-zed-editor)
6. [Visual Studio Code](#6-visual-studio-code)
7. [JetBrains IDEs](#7-jetbrains-ides)

---

## 1. Claude Code

Claude Code offers the most comprehensive Shipyard experience with plugin support for hooks and skills.

### Method 1: Plugin Install (Recommended)

Installs the full plugin including MCP server, hooks, and skills:

```bash
/plugin install SchoolAI/shipyard
```

**What you get:**
- ✅ MCP server with plan creation and artifact tools
- ✅ Hooks (auto-formatting, git workflows)
- ✅ Skills (planning workflows)
- ✅ Auto-updates when you pull new versions

**To update:**
```bash
/plugin update shipyard
```

**Verification:**
```bash
/plugin list              # Should show "shipyard"
/shipyard                 # Access Shipyard skills
```

### Method 2: Direct MCP Configuration

Install just the MCP server without hooks/skills:

**Option A: Command-line**
```bash
claude mcp add --transport stdio shipyard -- npx -y -p @schoolai/shipyard-mcp@latest mcp-server-shipyard
```

**Option B: JSON config (`.mcp.json` in your project root)**
```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**What you get:**
- ✅ MCP server tools
- ❌ No hooks
- ❌ No skills

**When to use:**
- You only need the MCP tools
- You want project-specific configuration
- You're testing different versions

---

## 2. Claude Desktop App

Claude Desktop supports MCP servers only (no plugin hooks/skills).

### Method 1: One-Click Extensions (Easiest)

1. Open Claude Desktop
2. Go to **Settings** → **Extensions** → **Browse extensions**
3. Search for "Shipyard" (when published to Anthropic marketplace)
4. Click **"Install"**

### Method 2: Manual Configuration

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Linux:** `~/.config/claude/claude_desktop_config.json`

Add to your config:

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": [
        "-y",
        "@schoolai/shipyard-mcp@latest",
        "mcp-server-shipyard"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Restart Claude Desktop** to load changes.

**What you get:**
- ✅ MCP server tools (create plans, add artifacts)
- ❌ No hooks or skills

---

## 3. Cursor

Cursor supports MCP via CLI commands or JSON configuration.

### Method 1: CLI (Recommended)

```bash
agent mcp add shipyard npx -y -p @schoolai/shipyard-mcp@latest mcp-server-shipyard
```

**Manage servers:**
```bash
agent mcp list              # List all servers
agent mcp enable shipyard   # Enable server
agent mcp disable shipyard  # Disable server
```

### Method 2: JSON Configuration

**Global (recommended):** `~/.cursor/mcp.json`

**Project:** `.cursor/mcp.json` (may not work reliably)

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Restart Cursor** after changes.

**What you get:**
- ✅ MCP tools available in Composer
- ❌ No hooks or skills

---

## 4. Windsurf

Windsurf integrates MCP through its Cascade AI assistant with a user-friendly marketplace.

### Method 1: MCP Marketplace (Easiest)

1. Open Cascade panel
2. Click **MCP icon** in top-right menu
3. Search for "Shipyard" (when published)
4. Click **"Install"**

### Method 2: Manual Configuration

**Config file:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Environment variable syntax:**
```json
{
  "env": {
    "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
  }
}
```

**What you get:**
- ✅ MCP tools in Cascade
- ❌ No hooks or skills

---

## 5. Zed Editor

Zed provides both GUI and JSON-based MCP configuration.

### Method 1: GUI (Recommended)

1. Open **Agent Panel**
2. Click **Settings** → **"Add Custom Server"**
3. Configure via modal:
   - Name: `shipyard`
   - Command: `npx`
   - Args: `-y @schoolai/shipyard-mcp@latest mcp-server-shipyard`

### Method 2: JSON Configuration

**Config file:** `~/.config/zed/settings.json` (macOS/Linux) or `%APPDATA%\Zed\settings.json` (Windows)

Add to your settings:

```json
{
  "context_servers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Verification:** Green dot next to "shipyard" in Agent Panel settings means it's running.

**What you get:**
- ✅ MCP tools in Agent Panel
- ❌ No hooks or skills

---

## 6. Visual Studio Code

VS Code supports MCP through workspace or user configuration.

### Method 1: Extensions View (Easiest)

1. Open **Extensions** sidebar
2. Search `@mcp` or "Shipyard"
3. Click **"Install"** (when published to VS Code marketplace)

### Method 2: Command Palette

1. Press **Ctrl+Shift+P** / **Cmd+Shift+P**
2. Run **"MCP: Add Server"**
3. Follow prompts

### Method 3: JSON Configuration

**Workspace:** `.vscode/mcp.json` (checked into git)

```json
{
  "servers": {
    "shipyard": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Reload VS Code** or run **"MCP: Restart Server"** from Command Palette.

**What you get:**
- ✅ MCP tools in Copilot/assistant
- ❌ No hooks or skills

---

## 7. JetBrains IDEs

JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, etc.) have built-in MCP support since version 2025.2.

### Configuration

1. Go to **Settings** → **Tools** → **AI Assistant** → **Model Context Protocol (MCP)**
2. Click **"Add"** to add Shipyard MCP server
3. Configure:
   - **Command:** `npx`
   - **Args:** `-y @schoolai/shipyard-mcp@latest mcp-server-shipyard`

### Legacy Plugin (Pre-2025.2)

For older IDE versions:
1. **Settings** → **Plugins**
2. Search **"MCP Server"**
3. Install and restart
4. Add JSON configuration

**What you get:**
- ✅ MCP tools in AI Assistant
- ❌ No hooks or skills

---

## Feature Comparison

| Client | MCP Server | Hooks | Skills | Auto-Update | Best For |
|--------|------------|-------|--------|-------------|----------|
| **Claude Code (plugin)** | ✅ | ✅ | ✅ | ✅ | Full Shipyard experience |
| **Claude Code (MCP only)** | ✅ | ❌ | ❌ | ❌ | Testing specific versions |
| **Claude Desktop** | ✅ | ❌ | ❌ | ❌ | Desktop chat with Shipyard |
| **Cursor** | ✅ | ❌ | ❌ | ❌ | Composer integration |
| **Windsurf** | ✅ | ❌ | ❌ | ❌ | Cascade AI integration |
| **Zed** | ✅ | ❌ | ❌ | ❌ | Lightweight editor |
| **VS Code** | ✅ | ❌ | ❌ | ❌ | Copilot integration |
| **JetBrains** | ✅ | ❌ | ❌ | ❌ | IntelliJ/PyCharm/etc |

**Recommendation:** Use Claude Code with plugin install for the full experience (hooks + skills + MCP).

---

## Configuration Options

All clients support these environment variables in MCP config:

```json
{
  "env": {
    "NODE_ENV": "production",
    "GITHUB_TOKEN": "${GITHUB_TOKEN}",
    "LOG_LEVEL": "info"
  }
}
```

**Available environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for stable behavior |
| `GITHUB_TOKEN` | (none) | GitHub PAT for artifact uploads |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `SHIPYARD_WEB_URL` | `http://localhost:5173` | URL to open plans in browser |
| `REGISTRY_PORT` | `32191` | Multi-instance coordination port |

---

## Version Management

### Install Specific Version

**Latest stable:**
```json
"args": ["-y", "-p", "@schoolai/shipyard-mcp@latest", "mcp-server-shipyard"]
```

**Next (RC):**
```json
"args": ["-y", "-p", "@schoolai/shipyard-mcp@next", "mcp-server-shipyard"]
```

**Specific version:**
```json
"args": ["-y", "-p", "@schoolai/shipyard-mcp@0.2.0", "mcp-server-shipyard"]
```

### Check Installed Version

```bash
npm view @schoolai/shipyard-mcp version        # Latest stable
npm view @schoolai/shipyard-mcp@next version   # Latest RC
```

---

## Troubleshooting

### "Command not found: npx"

Install Node.js from https://nodejs.org/ (LTS recommended, minimum v22)

### "MCP server failed to start"

1. Check Node.js version: `node --version` (need v22+)
2. Clear npm cache: `npx clear-npx-cache`
3. Try explicit version: `@schoolai/shipyard-mcp@0.1.0`

### "Permission denied"

Ensure npm global installs work:
```bash
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Server not appearing

1. Restart the client/IDE
2. Check config file syntax (valid JSON)
3. Verify config file location is correct for your platform

### Claude Code plugin not found

The plugin install command should be:
```bash
/plugin install SchoolAI/shipyard
```

Not from a marketplace - it installs directly from the GitHub repository.

### Browser won't open

**Issue:** Plan created but no browser launched

- **Check:** `SHIPYARD_WEB_URL` env var is set correctly
- **Check:** Browser is installed and accessible
- **Manual:** Copy the URL from MCP tool response and open manually

### Artifacts won't upload

**Error:** `403 Forbidden` on artifact upload
- **Cause:** No write permissions to repo
- **Fix:** Add `GITHUB_TOKEN` to env vars with `repo` scope

---

## Uninstallation

### Claude Code (plugin)

```bash
/plugin uninstall shipyard
```

### Claude Code (MCP only)

```bash
claude mcp remove shipyard
```

### Other Clients

Remove the `shipyard` entry from your MCP config file and restart the client.

---

## Platform-Specific Notes

### macOS
- Use `~` for home directory in all configs
- Standard location: `~/Library/Application Support/`
- Verify Node.js installed via Homebrew: `brew install node@22`

### Windows
- Use `%APPDATA%` or full path: `C:\Users\Username\AppData\Roaming`
- Backslashes require escaping in JSON: `"C:\\Users\\..."`
- WSL: Follow Linux conventions

### Linux
- Use `~/.config/` for user configs
- System-wide: `/etc/` (requires sudo)
- Verify npm global path: `npm config get prefix`

---

## Support

- **Issues:** https://github.com/SchoolAI/shipyard/issues
- **Discussions:** https://github.com/SchoolAI/shipyard/discussions
- **Documentation:** [docs/](../README.md)

---

*Last updated: 2026-01-21*
