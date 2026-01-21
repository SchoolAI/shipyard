# Local Development Hooks Setup

Similar to how we have `.mcp.json` for local MCP development and `.claude-plugin/mcp.json` for distribution, hooks need local dev configuration too.

## Problem

- **Distribution**: `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}` variable (works when plugin is installed)
- **Local Dev**: `~/.claude/settings.json` calls `shipyard-hook` npm binary (doesn't use your local changes)

## Solution

Use setup scripts to switch between local dev and production hooks.

## Quick Start

### 1. Setup Local Development

```bash
cd /Users/jacobpetterle/Working\ Directory/shipyard
./scripts/setup-hooks-dev.sh
```

This will:
- ✅ Backup your current `~/.claude/settings.json`
- ✅ Update hooks to point to local build: `apps/hook/dist/index.js`
- ✅ Add AskUserQuestion PreToolUse hook if missing

### 2. Make Changes & Rebuild

```bash
# Edit hook code
vim apps/hook/src/adapters/claude-code.ts

# Rebuild
pnpm --filter @shipyard/hook build
```

Hooks will now use your local changes!

### 3. Restore Production Hooks

When done with local development:

```bash
./scripts/restore-hooks-prod.sh
```

This restores hooks to use `shipyard-hook` npm binary.

## How It Works

The setup script uses `jq` to update your `~/.claude/settings.json`:

**Before (production):**
```json
{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "ExitPlanMode",
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
      "matcher": "ExitPlanMode",
      "hooks": [{"command": "node /Users/jacobpetterle/Working Directory/shipyard/apps/hook/dist/index.js"}]
    }]
  }
}
```

## Requirements

- `jq` must be installed: `brew install jq`

## Troubleshooting

### Hooks not firing?

1. Check if hook is built:
   ```bash
   ls -la apps/hook/dist/index.js
   ```

2. Check settings file:
   ```bash
   grep "shipyard" ~/.claude/settings.json
   ```

3. Check hook logs:
   ```bash
   tail -f ~/.shipyard/hook-debug.log
   ```

### Restore from backup manually:

```bash
# List backups
ls -lt ~/.claude/settings.json.backup-*

# Restore specific backup
cp ~/.claude/settings.json.backup-1737445678 ~/.claude/settings.json
```

## Files

- `scripts/setup-hooks-dev.sh` - Switch to local dev
- `scripts/restore-hooks-prod.sh` - Switch to production
- `hooks/hooks.json` - Distribution config (uses `${CLAUDE_PLUGIN_ROOT}`)
- `hooks/hooks-dev.json` - Reference config (not used by scripts)
- `~/.claude/settings.json` - Claude Code user settings (modified by scripts)

## See Also

- [SETUP.md](./SETUP.md) - General setup guide
- [engineering-standards.md](./engineering-standards.md) - Development practices
