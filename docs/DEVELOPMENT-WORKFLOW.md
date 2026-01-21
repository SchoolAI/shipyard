# Development Workflow

Guide for working on Shipyard while using Shipyard.

---

## The Problem

You want to:
1. Use the stable Shipyard plugin globally (from main branch)
2. Test local changes in worktrees without breaking the global install
3. Have both versions running simultaneously

---

## The Solution: Dual MCP Server Setup

### Global Install (Stable)

Install the plugin globally in your home directory:

```bash
# In Claude Code (any directory)
/plugin install SchoolAI/shipyard
```

This creates MCP server named: **`shipyard`**

**Uses:** Stable main branch, for actual work

---

### Local Dev (Testing)

Each worktree includes `.mcp-dev.json` (tracked in git):

**File:** `.mcp-dev.json`

```json
{
  "mcpServers": {
    "shipyard-dev": {
      "type": "stdio",
      "command": "node",
      "args": ["apps/server/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "SIGNALING_URL": "ws://localhost:4444",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Activate in worktree:**

```bash
cd /path/to/worktree

# Symlink to local Claude settings
mkdir -p .claude
ln -sf "$(pwd)/.mcp-dev.json" .claude/settings.local.json

# Rebuild after changes
pnpm build --filter @shipyard/server
```

This creates MCP server named: **`shipyard-dev`**

**Uses:** Your local changes in this worktree

---

## Using Both Simultaneously

Now you have two MCP servers available:

```
MCP Servers:
├── shipyard       (global plugin - stable)
└── shipyard-dev   (local worktree - testing)
```

**In Claude Code:**

```bash
# Check both are available
/mcp list

# Should show:
# - shipyard (from plugin)
# - shipyard-dev (from worktree)
```

**The tools will be prefixed by server name:**
- Stable: `create_plan`, `read_plan`, etc. (uses global plugin)
- Dev: Same tools but from local build

**Hooks behavior:**
- Global hooks (from plugin) are ALWAYS active
- To test local hook changes, temporarily disable global plugin:
  ```bash
  /plugin disable shipyard  # Disable global
  # Test your local changes
  /plugin enable shipyard   # Re-enable
  ```

---

## Development Workflow

### 1. Daily Work (Use Global Plugin)

```bash
# Work in any directory
# Global plugin handles plan creation
# Hooks work automatically
```

### 2. Testing Changes (Use Local Dev)

```bash
# In worktree
cd /Users/jacobpetterle/Working\ Directory/shipyard-wt/my-feature

# Build local changes
pnpm build --filter @shipyard/server

# Test with local server (shipyard-dev)
# Tools are available but you'll need to use them explicitly
```

### 3. Testing Hook Changes

```bash
# Use setup script to switch to local build
./scripts/setup-hooks-dev.sh

# Build local hook
pnpm build --filter @shipyard/hook

# Test - hooks now use local version
# [Enter plan mode, hooks should trigger with local code]

# When done, restore production hooks
./scripts/restore-hooks-prod.sh
```

**See [SETUP.md - Local Hooks Setup](./SETUP.md#local-hooks-setup) for detailed instructions.**

---

## Versioning and Release Workflow

### Development Phase

1. **Create feature branches** (using worktrees)
2. **Test with `shipyard-dev`** MCP server
3. **Merge PRs to main** (no publish happens)
4. **Accumulate features** for next release

### Release Candidate

When ready to test a grouped release:

```bash
# 1. Go to GitHub Actions
# 2. Run "Manual npm Publish" workflow
# 3. Inputs:
#    - Version: 0.2.0-rc.1
#    - npm tag: next
#    - Create git tag: yes

# This publishes to npm with "next" tag
```

**Test the RC:**
```bash
# Install RC version
npx -y -p @schoolai/shipyard-mcp@next mcp-server-shipyard

# Or in Cursor config:
{
  "mcpServers": {
    "shipyard-rc": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@next", "mcp-server-shipyard"]
    }
  }
}
```

**Create more RCs if needed:**
- v0.2.0-rc.2
- v0.2.0-rc.3

### Stable Release

When RC testing is complete:

```bash
# Run "Manual npm Publish" workflow again
# Inputs:
#    - Version: 0.2.0  (no -rc suffix)
#    - npm tag: latest
#    - Create git tag: yes
```

This publishes as the default stable version.

**Users get it with:**
```bash
npx -y -p @schoolai/shipyard-mcp mcp-server-shipyard  # Gets latest stable
```

---

## Version Management

### Where Versions Live

**Git tags:** Source of truth for releases
- `v0.1.0` - Stable
- `v0.2.0-rc.1` - Release candidate

**package-npm.json:** Updated during workflow (not manually)
- GitHub Actions sets version from git tag
- Don't need to manually update

**Workflow:**
```
Developer creates git tag → GitHub Actions publishes → npm gets that version
```

### Version Naming Convention

**Stable releases:**
- `v0.1.0`, `v0.2.0`, `v1.0.0`
- Publishes to npm with `latest` tag

**Release candidates:**
- `v0.2.0-rc.1`, `v0.2.0-rc.2`
- Publishes to npm with `next` tag

**Alpha/Beta (if needed):**
- `v0.2.0-alpha.1`, `v0.2.0-beta.1`
- Publishes to npm with `next` tag

---

## Quick Reference

### Daily Development
```bash
# Use global plugin (stable)
# Work normally in any directory
```

### Testing Local Changes
```bash
# In worktree
pnpm build --filter @shipyard/server
# shipyard-dev server now has your changes
```

### Testing Hook Changes
```bash
./scripts/setup-hooks-dev.sh
pnpm build --filter @shipyard/hook
# Test hooks
./scripts/restore-hooks-prod.sh
```

### Publishing Release Candidate
```
GitHub → Actions → Manual npm Publish
Version: 0.2.0-rc.1
Tag: next
```

### Publishing Stable
```
GitHub → Actions → Manual npm Publish
Version: 0.2.0
Tag: latest
```

---

## Troubleshooting

**Issue:** Both servers trying to use same port

**Solution:** Registry server is shared - both `shipyard` and `shipyard-dev` connect to it as clients. This is expected and works fine.

**Issue:** Hooks from global plugin interfere with local testing

**Solution:** Temporarily disable global plugin while testing hook changes.

**Issue:** Don't know which version is running

**Check:** MCP server logs show version in startup message (add this as future enhancement)

---

*Last updated: 2026-01-20*
