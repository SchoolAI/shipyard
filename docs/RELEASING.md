# Release Process

How to publish new versions of Shipyard to npm.

---

## Release Flow

```
                            ┌─────────────────────────────────────┐
                            │           DEVELOPMENT               │
                            │  (commits merged to main branch)    │
                            └──────────────┬──────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            │
  ┌───────────────────────┐    ┌───────────────────────┐               │
  │  NIGHTLY BUILDS       │    │  READY FOR RELEASE?   │               │
  │  (Automatic)          │    │                       │               │
  │                       │    │  Trigger RC manually  │               │
  │  2:15 AM UTC daily    │    │  Action: rc           │               │
  │  0.3.2-nightly.DATE   │    └───────────┬───────────┘               │
  │                       │                │                            │
  │  For bleeding-edge    │                ▼                            │
  │  testing only         │    ┌───────────────────────┐               │
  └───────────────────────┘    │  RELEASE CANDIDATE    │               │
              │                │                       │               │
              │                │  0.3.2-rc.20260125    │               │
              │                │  npm tag: @next       │               │
              │                └───────────┬───────────┘               │
              │                            │                            │
              │                            ▼                            │
              │                ┌───────────────────────┐               │
              │                │  TESTING PHASE        │               │
              │                │                       │               │
              │                │  Team tests the RC    │               │
              │                │  npm install ...@next │               │
              │                └───────────┬───────────┘               │
              │                            │                            │
              │                   ┌────────┴────────┐                   │
              │                   │                 │                   │
              │                   ▼                 ▼                   │
              │         ┌─────────────┐    ┌─────────────┐             │
              │         │  PASSED ✓   │    │  FAILED ✗   │             │
              │         └──────┬──────┘    └──────┬──────┘             │
              │                │                  │                     │
              │                ▼                  └─────────────────────┘
              │    ┌───────────────────────┐              (fix & retry)
              │    │  PROMOTE TO STABLE    │
              │    │                       │
              │    │  Action: promote      │
              │    │  rc_version: 0.3.2-rc.20260125
              │    │  stable_version: 0.4.0│
              │    └───────────┬───────────┘
              │                │
              │                ▼
              │    ┌───────────────────────┐
              │    │  STABLE RELEASE       │
              │    │                       │
              │    │  0.4.0                │
              │    │  npm tag: @latest     │
              │    │  GitHub Release       │
              │    └───────────────────────┘
              │
              ▼
  ┌───────────────────────────────────────┐
  │  OPTIONAL: Promote nightly directly   │
  │                                       │
  │  If a nightly has been well-tested,   │
  │  you CAN promote it directly:         │
  │                                       │
  │  rc_version: 0.3.2-nightly.20260125   │
  │  stable_version: 0.4.0                │
  └───────────────────────────────────────┘
```

### The Two Paths

**Standard Release Path (Recommended):**

```
Development → RC → Test → Promote → Stable
```

**Bleeding Edge Path (Optional):**

```
Development → Nightly (auto) → [well tested over time] → Promote → Stable
```

The nightlies are for continuous integration / early adopters who want the latest.
The RC is explicitly "we're ready to release, final validation before going stable."

---

## Quick Summary

| Path | Trigger | Version Example | npm Tag | Use Case |
|------|---------|-----------------|---------|----------|
| **Nightly** | Auto at 2:15 AM UTC | `0.3.2-nightly.20260125` | `@next` | Daily bleeding edge |
| **Manual Nightly** | workflow_dispatch → nightly | `0.3.2-nightly.20260125` | `@next` | Force a nightly now |
| **Release Candidate** | workflow_dispatch → rc | `0.3.2-rc.20260125` | `@next` | "This is stable-ready, test it" |
| **Stable** | workflow_dispatch → promote | `0.4.0` | `@latest` | Production release |

**All publishing uses OIDC trusted publishing** - no tokens to manage!

---

## Nightly Builds (Automatic)

**Every night at 2:15 AM UTC, if there are changes:**

```
Schedule triggers → check for changes → 0.3.2-nightly.20260125 published to @next
```

**Version scheme:** `{base}-nightly.{YYYYMMDD}`
- Clear date stamp shows when it was built
- Skipped if no commits since last nightly/rc

**Install nightly:**
```bash
npm install @schoolai/shipyard-mcp@next
# or
npx -y -p @schoolai/shipyard-mcp@next mcp-server-shipyard
```

---

## Release Candidates (Manual)

When you want to mark a build as ready for testing before a stable release:

1. Go to: https://github.com/SchoolAI/shipyard/actions/workflows/publish-npm.yml
2. Click **"Run workflow"**
3. Select **"rc"** from the dropdown
4. Click **"Run workflow"**

**Version scheme:** `{base}-rc.{YYYYMMDD}`

This signals "we think this is ready for stable, please test it."

---

## Publishing a Stable Release

When you're ready to make a version the default for users:

### Using the Promote Action (Recommended)

1. Go to: https://github.com/SchoolAI/shipyard/actions/workflows/publish-npm.yml
2. Click **"Run workflow"**
3. Select **"promote"** from the dropdown
4. Fill in:
   - **rc_version:** The version to promote (e.g., `0.3.2-rc.20260125` or `0.3.2-nightly.20260125`)
   - **stable_version:** The stable version (e.g., `0.4.0`)
5. Click **"Run workflow"**

**What happens:**
- Downloads the specified pre-release from npm
- Re-publishes it as the stable version with `@latest` tag
- Updates `package-npm.json` with the new version
- Creates a git tag and GitHub release

---

## Workflow Architecture

**Single workflow handles everything:** `.github/workflows/publish-npm.yml`

```
┌─────────────────────────────────────────────────────────────┐
│                    publish-npm.yml                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Triggers:                                                  │
│  ├── schedule (2:15 AM UTC)  → Nightly build (@next)        │
│  └── workflow_dispatch:                                     │
│      ├── nightly             → Manual nightly (@next)       │
│      ├── rc                  → Release candidate (@next)    │
│      └── promote             → Stable release (@latest)     │
│                                                             │
│  Change Detection:                                          │
│  └── Scheduled builds only run if changes since last tag    │
│                                                             │
│  Authentication: OIDC Trusted Publishing (no tokens!)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why one workflow?** npm's OIDC trusted publishing only allows one workflow per package. Consolidating ensures all publishes use secure OIDC auth.

---

## Version Management

### package-npm.json

This file controls the base version for builds:

```json
{
  "version": "0.3.2"
}
```

**Nightly/RC versions:** `{version}-nightly.{YYYYMMDD}` or `{version}-rc.{YYYYMMDD}`
- If version is `0.3.2` → builds are `0.3.2-nightly.20260125`, `0.3.2-rc.20260125`, etc.

**When to update:**
- When releasing a new stable version (via promote action)
- When starting a new version series (e.g., `0.3.0` → `0.4.0`)

### npm Dist Tags

| Tag | What it means | Install command |
|-----|---------------|-----------------|
| `latest` | Stable release | `npm install @schoolai/shipyard-mcp` |
| `next` | Nightly/RC/prerelease | `npm install @schoolai/shipyard-mcp@next` |

---

## Example: Full Release Cycle

```bash
# Week 1-2: Develop features, merge PRs to main
# Nightly builds auto-publish: 0.3.2-nightly.20260120, 0.3.2-nightly.20260121, etc.

# Ready to test for release:
# Trigger RC manually via GitHub Actions
# → 0.3.2-rc.20260125 published

# Test the RC:
npm view @schoolai/shipyard-mcp@next version  # 0.3.2-rc.20260125
npx -y -p @schoolai/shipyard-mcp@next mcp-server-shipyard
# ✅ Works great!

# Promote to stable via GitHub Actions:
# action: promote
# rc_version: 0.3.2-rc.20260125
# stable_version: 0.4.0
# → 0.4.0 published to @latest

# Verify:
npm view @schoolai/shipyard-mcp version  # 0.4.0 ✅
```

---

## Rollback

If a published version has issues:

```bash
# Deprecate the bad version (shows warning on install)
npm deprecate @schoolai/shipyard-mcp@0.4.0 "Bug in auth, use 0.4.1"

# Promote an older nightly/RC to a new stable version
# via GitHub Actions promote action
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

npm doesn't allow republishing the same version:
- If same day: Wait until tomorrow (version includes date)
- Or manually bump the base version in `package-npm.json`

### Nightly didn't run

Check:
- Are there changes since the last nightly/rc tag?
- Check the workflow run logs for "No changes since..." message

### Workflow not triggering

Check the trigger conditions:
- **Schedule:** Runs at 2:15 AM UTC daily (only if changes)
- **Manual:** Use "Run workflow" button in GitHub Actions

---

*Last updated: 2026-01-25*
