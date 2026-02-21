# Installation Guide

How to install and configure Shipyard.

---

## Quick Start

**For Claude Code users (recommended):**
```bash
# Step 1: Add the marketplace
/plugin marketplace add https://github.com/SchoolAI/shipyard.git

# Step 2: Install the plugin
/plugin install shipyard@schoolai-shipyard
```

**For standalone daemon usage:** See [Daemon CLI](#daemon-cli) below.

---

## Table of Contents

1. [Claude Code (Plugin)](#1-claude-code-plugin)
2. [Daemon CLI](#2-daemon-cli)
3. [Version Management](#3-version-management)
4. [Configuration Options](#4-configuration-options)

---

## 1. Claude Code (Plugin)

Claude Code offers the most comprehensive Shipyard experience with plugin support for hooks and skills.

### Plugin Install (Recommended)

Installs the full plugin including hooks, skills, and tools:

```bash
# Step 1: Add the marketplace
/plugin marketplace add https://github.com/SchoolAI/shipyard.git

# Step 2: Install the plugin
/plugin install shipyard@schoolai-shipyard
```

**What you get:**
- Hooks (auto-formatting, git workflows)
- Skills (planning workflows, council reviews)
- Auto-updates when you pull new versions

**To update:**
```bash
/plugin update shipyard@schoolai-shipyard
```

**Verification:**
```bash
/plugin list              # Should show "shipyard@schoolai-shipyard"
/shipyard                 # Access Shipyard skills
```

---

## 2. Daemon CLI

The `@schoolai/shipyard` npm package provides the Shipyard daemon — a CLI tool that runs Claude Agent SDK sessions with Loro CRDT sync. It handles authentication, task execution, and real-time collaboration.

### Install

```bash
npm install -g @schoolai/shipyard@latest
```

Or run directly with npx:

```bash
npx @schoolai/shipyard --help
```

### Authentication

```bash
shipyard login              # Device flow auth (opens browser)
shipyard login --check      # Check current auth status
shipyard logout             # Clear stored credentials
```

### Usage

```bash
# Run a task with a prompt
shipyard --prompt "Fix the bug in auth.ts"

# Resume an existing session
shipyard --resume <session-id> --task-id <id>

# Run in serve mode (signaling + agent spawning)
shipyard --serve
```

### CLI Options

| Option | Short | Description |
|--------|-------|-------------|
| `--prompt <text>` | `-p` | Prompt for the agent |
| `--task-id <id>` | `-t` | Task ID (auto-generated if omitted) |
| `--resume <id>` | `-r` | Resume session by session ID |
| `--data-dir <path>` | `-d` | Data directory (default: `~/.shipyard/data`) |
| `--cwd <path>` | | Working directory for agent |
| `--model <name>` | `-m` | Model to use |
| `--serve` | `-s` | Run in serve mode |
| `--help` | `-h` | Show help |

---

## 3. Version Management

### Install Specific Version

```bash
# Latest stable
npm install -g @schoolai/shipyard@latest

# Latest RC/nightly
npm install -g @schoolai/shipyard@next

# Specific version
npm install -g @schoolai/shipyard@0.8.0
```

### Check Available Versions

```bash
npm view @schoolai/shipyard version        # Latest stable
npm view @schoolai/shipyard@next version   # Latest RC/nightly
npm view @schoolai/shipyard versions       # All versions
```

---

## 4. Configuration Options

The daemon supports these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | API key for Claude (optional, overrides OAuth) |
| `SHIPYARD_DEV` | (none) | Set to `1` for dev mode (uses `~/.shipyard-dev/`) |
| `SHIPYARD_DATA_DIR` | `~/.shipyard/data` | Data directory (overridden by `--data-dir`) |
| `LOG_LEVEL` | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `SHIPYARD_SIGNALING_URL` | (auto) | Signaling server WebSocket URL |
| `SHIPYARD_USER_TOKEN` | (none) | JWT for signaling auth (from `shipyard login`) |
| `SHIPYARD_USER_ID` | (none) | User ID for signaling path (from `shipyard login`) |
| `SHIPYARD_MACHINE_ID` | `os.hostname()` | Machine identifier |
| `SHIPYARD_MACHINE_NAME` | `os.hostname()` | Human-readable machine name |

---

## Troubleshooting

### "Command not found: npx"

Install Node.js from https://nodejs.org/ (LTS recommended, minimum v22)

### "Permission denied"

Ensure npm global installs work:
```bash
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

### Claude Code plugin not found

The plugin requires two steps:
```bash
# Step 1: Add the marketplace
/plugin marketplace add https://github.com/SchoolAI/shipyard.git

# Step 2: Install the plugin
/plugin install shipyard@schoolai-shipyard
```

Make sure to add the marketplace first before attempting to install.

### Authentication issues

```bash
shipyard login --check    # Verify token status
shipyard logout           # Clear and re-authenticate
shipyard login
```

---

## Uninstallation

### Claude Code (plugin)

```bash
/plugin uninstall shipyard@schoolai-shipyard
```

### Daemon CLI

```bash
npm uninstall -g @schoolai/shipyard
```

---

## Platform-Specific Notes

### macOS
- Verify Node.js installed via Homebrew: `brew install node@22`

### Windows
- WSL recommended for best experience
- Native Windows: ensure npm is in PATH

### Linux
- Verify npm global path: `npm config get prefix`

---

## Support

- **Issues:** https://github.com/SchoolAI/shipyard/issues
- **Discussions:** https://github.com/SchoolAI/shipyard/discussions
- **Documentation:** [docs/](../README.md)

---

*Last updated: 2026-02-21*
