# Release Process

How to publish new versions of Shipyard to npm.

---

## Automated Release Candidates

**Every merge to main automatically publishes an RC:**

```
Merge PR to main → Auto-publish: 0.2.0-next.156
                                    ↓
                            npm install @schoolai/shipyard-mcp@next
```

**Version scheme:** `{base}-next.{commit_count}`
- `0.2.0-next.156` (commit count: 156)
- `0.2.0-next.157` (commit count: 157)
- Predictable, incrementing, easy to reference

**No manual work required!**

---

## Promoting RC to Stable

When you've tested an RC and want to make it the default:

### Via GitHub Actions (Recommended)

1. Go to: https://github.com/SchoolAI/shipyard/actions/workflows/promote-stable.yml
2. Click "Run workflow"
3. Enter:
   - **RC version:** `0.2.0-next.158` (the one you tested)
   - **Stable version:** `0.2.0` (what users will get)
4. Click "Run workflow"

**What happens:**
- ✅ Same build promoted to `latest` tag (no rebuild)
- ✅ Git tag `v0.2.0` created
- ✅ GitHub Release created
- ✅ `package-npm.json` updated to `0.2.0`
- ✅ Commit pushed to main

### Via CLI (Manual)

```bash
# Promote existing RC to latest
npm dist-tag add @schoolai/shipyard-mcp@0.2.0-next.158 latest

# Update package-npm.json
vim package-npm.json  # Set "version": "0.2.0"
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

---

## Version Management

**package-npm.json:** Base version for RCs

```json
{
  "version": "0.2.0"  // Update only when promoting to stable
}
```

**Auto-generated RC versions:**
- Built from: `{package-npm.json version}-next.{commit_count}`
- Example: If package shows `0.2.0`, RCs will be `0.2.0-next.156`, `0.2.0-next.157`, etc.

**When to bump package-npm.json:**
- Only when promoting RC to stable (via promote workflow)
- Workflow auto-updates it for you
- Or manually if you want to start a new version series

---

## Release Workflow

### Testing RCs

Every merge to main is immediately available for testing:

```bash
# Get latest RC
npm view @schoolai/shipyard-mcp@next version

# Install it
npx -y -p @schoolai/shipyard-mcp@next mcp-server-shipyard

# Or add to Cursor config for testing
{
  "mcpServers": {
    "shipyard-rc": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@next", "mcp-server-shipyard"]
    }
  }
}
```

---

## Version Naming Convention

### Stable Releases

```
0.1.0 → 0.2.0 → 1.0.0
```

Use when: Changes are tested and ready for production

### Release Candidates

```
0.2.0-rc.1 → 0.2.0-rc.2 → 0.2.0
```

Use when: You want to test before stable release

### Alpha/Beta (if needed)

```
0.2.0-alpha.1  # Early testing
0.2.0-beta.1   # Feature complete, needs testing
0.2.0-rc.1     # Final testing before stable
0.2.0          # Stable
```

---

## npm Dist Tags

When you publish, the version goes to an npm "tag":

**`latest` tag** (default):
```bash
npm install @schoolai/shipyard-mcp  # Gets latest stable
```

**`next` tag** (for RCs):
```bash
npm install @schoolai/shipyard-mcp@next  # Gets latest RC
```

**Both can exist simultaneously:**
- `latest` → 0.1.0 (stable)
- `next` → 0.2.0-rc.1 (testing)

---

## Example Release Cycle

### Scenario: Multiple features ready for v0.2.0

```bash
# Week 1-2: Merge feature PRs to main (no publish)
# - PR #101: Add new tool
# - PR #102: Fix bug
# - PR #103: Update UI

# Week 3: Ready to test together

# 1. Bump version to RC
vim package-npm.json  # Set "version": "0.2.0-rc.1"
git commit -am "chore: bump version to 0.2.0-rc.1"
git push origin main

# 2. Publish RC
GitHub Actions → Manual npm Publish → npm_tag: next

# 3. Test RC
npx @schoolai/shipyard-mcp@next mcp-server-shipyard

# Found issues? Fix and create rc.2
vim package-npm.json  # Set "version": "0.2.0-rc.2"
git commit -am "chore: bump version to 0.2.0-rc.2"
# Publish again with 'next' tag

# 4. RC testing complete, make it stable
vim package-npm.json  # Set "version": "0.2.0"
git commit -am "chore: release v0.2.0"
git push origin main

# 5. Publish stable
GitHub Actions → Manual npm Publish → npm_tag: latest
```

Now users get v0.2.0 by default:
```bash
npx @schoolai/shipyard-mcp mcp-server-shipyard  # Gets 0.2.0
```

---

## Rollback

If a published version has issues:

```bash
# Deprecate the bad version
npm deprecate @schoolai/shipyard-mcp@0.2.0 "Broken build, use 0.2.1"

# Publish a fix
vim package-npm.json  # Set "version": "0.2.1"
git commit -am "chore: bump version to 0.2.1"
# Trigger workflow
```

**Note:** Can only unpublish within 72 hours of publishing. After that, must deprecate and publish a fix.

---

## GitHub Plugin Version

**Important:** The GitHub plugin version is separate from npm!

**Plugin version:** Set in `.claude-plugin/plugin.json`
```json
{
  "version": "1.0.0"
}
```

This should match your major version but doesn't need to match exact npm version (plugin includes MCP server + hooks + skills, npm is just server).

**Recommendation:** Keep them in sync for clarity:
- npm: `0.2.0` → plugin: `0.2.0`
- Bump both in the same commit

---

*Last updated: 2026-01-20*
