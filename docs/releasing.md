# Release Process

How to publish and test Shipyard releases.

---

## Part 1: Publishing Releases

### Release Flow

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
              │         │  PASSED     │    │  FAILED     │             │
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

### Quick Summary

| Path | Trigger | Version Example | npm Tag | Use Case |
|------|---------|-----------------|---------|----------|
| **Nightly** | Auto at 2:15 AM UTC | `0.3.2-nightly.20260125` | `@next` | Daily bleeding edge |
| **Manual Nightly** | workflow_dispatch → nightly | `0.3.2-nightly.20260125` | `@next` | Force a nightly now |
| **Release Candidate** | workflow_dispatch → rc | `0.3.2-rc.20260125` | `@next` | "This is stable-ready, test it" |
| **Stable** | workflow_dispatch → promote | `0.4.0` | `@latest` | Production release |

**All publishing uses OIDC trusted publishing** - no tokens to manage!

### Daemon Package

The daemon CLI publishes separately as `@schoolai/shipyard` (see `apps/daemon/package-npm.json`). Users authenticate via:

```bash
npx @schoolai/shipyard login    # Device flow auth
npx @schoolai/shipyard --help   # See all commands
```

Release notes should highlight changes to:
- CLI commands (`login`, `logout`, `--check`)
- Token format or expiry changes
- Signaling server URL changes

### Triggering Releases

**Via GitHub Actions UI:**
1. Go to: https://github.com/SchoolAI/shipyard/actions/workflows/publish-npm.yml
2. Click **"Run workflow"**
3. Select action type (nightly, rc, or promote)
4. Click **"Run workflow"**

**Via CLI:**
```bash
# Trigger nightly build
gh workflow run publish-npm.yml -f action=nightly

# Trigger RC release
gh workflow run publish-npm.yml -f action=rc

# Promote RC to stable
gh workflow run publish-npm.yml \
  -f action=promote \
  -f rc_version=0.4.1-rc.20260128 \
  -f stable_version=0.4.2
```

### Version Management

The `package-npm.json` file controls the base version:

```json
{
  "version": "0.3.2"
}
```

**npm Dist Tags:**

| Tag | What it means | Install command |
|-----|---------------|-----------------|
| `latest` | Stable release | `npm install @schoolai/shipyard-mcp` |
| `next` | Nightly/RC/prerelease | `npm install @schoolai/shipyard-mcp@next` |

### Rollback

```bash
# Deprecate a bad version
npm deprecate @schoolai/shipyard-mcp@0.4.0 "Bug in auth, use 0.4.1"

# Then promote an older RC to a new stable version
```

---

## Part 2: Testing Releases

### Two Testing Modes

| Mode | When to Use | What to Skip |
|------|-------------|--------------|
| **Post-Deployment** | Version already published to npm | Build steps - go straight to functional testing |
| **Pre-Publish** | Testing local changes before publishing | Nothing - full build verification needed |

### Pre-Publish Quick Reference

```bash
# Build and test locally
pnpm install && pnpm build && pnpm check

# Start all services
pnpm cleanup && pnpm dev:all

# Run full test suite
pnpm test
```

### Setting Up Claude Code for RC Testing

The Shipyard plugin has two components:
1. **MCP server** (npm package) - The tools and APIs
2. **Hooks + Skills** (GitHub plugin) - Plan mode behavior, skills

**Step 1: Update plugin for latest hooks/skills**
```bash
/plugin update shipyard@schoolai-shipyard
```

**Step 2: Override MCP to use RC version**

Create `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "shipyard": {
      "command": "npx",
      "args": ["-y", "-p", "@schoolai/shipyard-mcp@next", "mcp-server-shipyard"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Step 3: Reload and verify**
```bash
/mcp reload
npm view @schoolai/shipyard-mcp@next version  # Should show RC version
```

**Step 4: After testing - Revert `.mcp.json`**

Restore to local development configuration to avoid using npm package instead of local build.

### Test Categories

#### Core Functionality
| Test | Pass Criteria |
|------|---------------|
| Create plan | Browser opens with plan visible |
| Plan content | Title, content, checkboxes render |
| Plan sync | Changes appear in Claude `read_plan` |
| Deliverables | `{#deliverable}` markers extracted and listed |

#### Input System (8 types)
| Type | Expected Behavior |
|------|-------------------|
| text | Single-line text input |
| multiline | Multi-line textarea |
| choice | Radio buttons with "Other" escape hatch |
| confirm | Yes/No buttons |
| number | Numeric input with validation |
| email | Email validation |
| date | Date picker |
| rating | Stars (<=5) or numbers (>5) |

#### Platform Hooks (Claude Code)
| Test | Pass Criteria |
|------|---------------|
| AskUserQuestion Rejection | Hook blocks it, suggests `requestUserInput()` |
| Plan Mode Entry | Browser opens with new task |
| Plan Mode Approval | Hook blocks until human approves |
| Session Context | taskId/sessionToken injected after approval |

#### Artifacts & Deliverables
| Test | Pass Criteria |
|------|---------------|
| Image artifact | Uploads, appears in task UI |
| HTML artifact | Renders in artifact viewer |
| Video artifact | Playable in artifact viewer |
| Auto-complete | Returns `snapshotUrl` when all deliverables fulfilled |

### Bug Fix Workflow

When bugs are found during RC testing:

1. **Document the bug**
2. **Fix and verify locally**
3. **Run tests:** `pnpm check`
4. **Commit with clear message**

### Testing Checklist Template

```markdown
## RC Testing: vX.Y.Z-rc.NNN

### Build Verification
- [ ] `pnpm install` - Dependencies install
- [ ] `pnpm build` - All packages build
- [ ] `pnpm check` - All checks pass

### Core Features
- [ ] Create plan via MCP
- [ ] Plan renders in browser
- [ ] Real-time sync works
- [ ] Deliverables extract correctly

### Input System
- [ ] text, multiline, choice, confirm
- [ ] number, email, date, rating
- [ ] Multi-question form

### Workflows
- [ ] Share link works
- [ ] Plan mode hooks
- [ ] Sign-in/sign-out flow

### Ready to Promote?
- [ ] All tests pass
- [ ] Manual testing complete
- [ ] No blocking issues found
```

---

## Troubleshooting

### "OIDC authentication failed"
Verify `publish-npm.yml` is listed under "Trusted Publishers" at:
https://www.npmjs.com/package/@schoolai/shipyard-mcp/access

### "Version already exists"
npm doesn't allow republishing. Wait until tomorrow (version includes date) or bump the base version.

### Nightly didn't run
Check workflow logs for "No changes since..." - it skips if no commits since last tag.

### RC not loading in Claude Code
1. Verify `.mcp.json` points to `@next`
2. Run `/mcp reload`
3. Check: `npm view @schoolai/shipyard-mcp@next version`

---

*Last updated: 2026-01-31*
