# Release Process

How to publish new versions of Shipyard to npm.

---

## Quick Reference

| Action | How | Result |
|--------|-----|--------|
| **Auto RC** | Push/merge to `main` | `0.1.0-next.{commit#}` → `@next` |
| **Manual RC** | GitHub Actions → Run workflow | Same as above |
| **Stable release** | Push tag `v0.2.0` | `0.2.0` → `@latest` |
| **Prerelease tag** | Push tag `v0.2.0-rc.1` | `0.2.0-rc.1` → `@next` |

**All publishing uses OIDC trusted publishing** - no tokens to manage!

---

## Automated RC Releases (Default)

**Every push to main automatically publishes an RC:**

```
Push to main → publish-npm.yml → 0.1.0-next.435 published to @next
```

**Version scheme:** `{base}-next.{commit_count}`
- Predictable, incrementing, easy to reference
- No manual work required!

**Install RC:**
```bash
npx -y @schoolai/shipyard-mcp@next mcp-server-shipyard
```

---

## Publishing a Stable Release

When you're ready to make a version the default for users:

### Option 1: Create a Git Tag (Recommended)

```bash
# 1. Update version in package-npm.json
vim package-npm.json  # Set "version": "0.2.0"

# 2. Commit the version bump
git add package-npm.json
git commit -m "chore: release v0.2.0"

# 3. Create and push the tag
git tag v0.2.0
git push origin main v0.2.0
```

**What happens:**
- GitHub Actions detects the `v*` tag
- Publishes `0.2.0` to `@latest` tag
- Users now get `0.2.0` by default

### Option 2: Promote Existing RC

If you've tested an RC and want to promote it without rebuilding:

```bash
# Promote RC to latest (no rebuild)
npm dist-tag add @schoolai/shipyard-mcp@0.1.0-next.435 latest
```

Then update `package-npm.json` to match:
```bash
vim package-npm.json  # Set "version": "0.2.0"
git commit -am "chore: release v0.2.0"
git push origin main
```

---

## Manual Workflow Dispatch

To manually trigger a publish without pushing code:

1. Go to: https://github.com/SchoolAI/shipyard/actions/workflows/publish-npm.yml
2. Click **"Run workflow"**
3. Select branch: `main`
4. Click **"Run workflow"**

This publishes an RC version (`0.1.0-next.{commit#}`) to `@next`.

---

## Workflow Architecture

**Single workflow handles everything:** `.github/workflows/publish-npm.yml`

```
┌─────────────────────────────────────────────────────────────┐
│                    publish-npm.yml                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Triggers:                                                  │
│  ├── push to main branch    → RC release (next tag)        │
│  ├── push v* tag            → Stable release (latest tag)  │
│  └── workflow_dispatch      → RC release (next tag)        │
│                                                             │
│  Authentication: OIDC Trusted Publishing (no tokens!)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why one workflow?** npm's OIDC trusted publishing only allows one workflow per package. Consolidating ensures all publishes use secure OIDC auth.

---

## Version Management

### package-npm.json

This file controls the base version for RC releases:

```json
{
  "version": "0.2.0"
}
```

**RC versions:** `{version}-next.{commit_count}`
- If version is `0.2.0` → RCs are `0.2.0-next.435`, `0.2.0-next.436`, etc.

**When to update:**
- When releasing a new stable version
- When starting a new version series (e.g., `0.2.0` → `0.3.0`)

### npm Dist Tags

| Tag | What it means | Install command |
|-----|---------------|-----------------|
| `latest` | Stable release | `npm install @schoolai/shipyard-mcp` |
| `next` | RC/prerelease | `npm install @schoolai/shipyard-mcp@next` |

---

## Example: Full Release Cycle

```bash
# Day 1-5: Develop features, merge PRs to main
# Each merge auto-publishes: 0.2.0-next.430, 0.2.0-next.431, etc.

# Day 6: Ready to release v0.2.0

# 1. Test the latest RC
npm view @schoolai/shipyard-mcp@next version  # 0.2.0-next.435
npx -y @schoolai/shipyard-mcp@next mcp-server-shipyard
# ✅ Works great!

# 2. Create stable release
git tag v0.2.0
git push origin v0.2.0

# 3. Verify
npm view @schoolai/shipyard-mcp version  # 0.2.0 ✅

# 4. Update base version for next cycle
vim package-npm.json  # Set "version": "0.3.0"
git commit -am "chore: start v0.3.0 development"
git push origin main
# Now RCs will be 0.3.0-next.436, 0.3.0-next.437, etc.
```

---

## Rollback

If a published version has issues:

```bash
# Deprecate the bad version (shows warning on install)
npm deprecate @schoolai/shipyard-mcp@0.2.0 "Bug in auth, use 0.2.1"

# Publish a fix
vim package-npm.json  # Set "version": "0.2.1"
git commit -am "chore: release v0.2.1"
git tag v0.2.1
git push origin main v0.2.1
```

**Note:** npm only allows unpublishing within 72 hours. After that, deprecate and publish a fix.

---

## Claude Code Plugin Version

The GitHub plugin is separate from npm:

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin metadata and version |
| `.mcp.json` | MCP server config (points to npm package) |
| `hooks/hooks.json` | Hook configurations |
| `skills/` | Skill definitions |

**Recommendation:** Keep plugin version in sync with npm for clarity.

---

## Troubleshooting

### "OIDC authentication failed"

The workflow must be registered as a trusted publisher on npm:
1. Go to: https://www.npmjs.com/package/@schoolai/shipyard-mcp/access
2. Verify `publish-npm.yml` is listed under "Trusted Publishers"

### "Version already exists"

npm doesn't allow republishing the same version. Either:
- Bump the version in `package-npm.json`
- Or wait for next commit (RC version increments automatically)

### Workflow not triggering

Check the trigger conditions:
- **Push to main:** Must be a direct push or merged PR
- **Tag push:** Tag must match `v*` pattern (e.g., `v0.2.0`)
- **Manual:** Use "Run workflow" button in GitHub Actions

---

*Last updated: 2026-01-21*
