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
  │  0.3.2-nightly.DATE.N │    └───────────┬───────────┘               │
  │                       │                │                            │
  │  For bleeding-edge    │                ▼                            │
  │  testing only         │    ┌───────────────────────┐               │
  └───────────────────────┘    │  RELEASE CANDIDATE    │               │
              │                │                       │               │
              │                │  0.3.2-rc.20260125.0  │               │
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
              │    │  promote_version:      │
              │    │  0.3.2-rc.20260125.0   │
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
  │  promote_version:                     │
  │  0.3.2-nightly.20260125.0             │
  └───────────────────────────────────────┘
```

### Quick Summary

| Path | Trigger | Version Example | npm Tag | Use Case |
|------|---------|-----------------|---------|----------|
| **Nightly** | Auto at 2:15 AM UTC | `0.3.2-nightly.20260125.0` | `@next` | Daily bleeding edge (automatic only) |
| **Release Candidate** | workflow_dispatch → rc | `0.3.2-rc.20260125.0` | `@next` | "This is stable-ready, test it" |
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
3. Select release type (`rc` or `promote`)
4. Click **"Run workflow"**

**Via CLI:**
```bash
# Trigger RC release
gh workflow run publish-npm.yml -f release_type=rc

# Promote RC to stable
gh workflow run publish-npm.yml \
  -f release_type=promote \
  -f promote_version=0.4.1-rc.20260128.0
```

Nightlies run automatically at 2:15 AM UTC and cannot be triggered manually. Use `rc` for on-demand pre-releases.

### Version Management

The `apps/daemon/package-npm.json` file controls the base version:

```json
{
  "version": "0.8.0"
}
```

**How version numbers work:**

Nightly and RC versions use the format: `{base}-{type}.{date}.{counter}`

| Component | Example | Description |
|-----------|---------|-------------|
| Base | `0.8.0` | From `package-npm.json` |
| Type | `rc` | `nightly` (auto) or `rc` (manual) |
| Date | `20260221` | UTC date stamp |
| Counter | `.0` | Auto-incremented to avoid collisions |

Multiple publishes on the same day produce: `0.8.0-rc.20260221.0`, `0.8.0-rc.20260221.1`, etc. The workflow queries the npm registry for existing versions with the same prefix and increments the counter.

**npm Dist Tags:**

| Tag | What it means | Install command |
|-----|---------------|-----------------|
| `latest` | Stable release | `npm install @schoolai/shipyard` |
| `next` | Nightly/RC/prerelease | `npm install @schoolai/shipyard@next` |

**What happens on each release type:**

| Release Type | What the workflow does |
|-------------|----------------------|
| **Nightly** | Checks for code changes since last tag → builds → computes version with counter → publishes to `@next` → creates git tag + GitHub pre-release |
| **RC** | Same as nightly but uses `rc` prefix instead of `nightly` |
| **Promote** | Downloads the pre-release tarball from npm → strips the pre-release suffix → republishes as stable `@latest` → creates GitHub release → opens a PR to bump the base version for the next cycle |

**Idempotency:** If a version already exists on npm, the workflow skips the publish step gracefully instead of failing with a 403 error.

**Change detection:** Nightly/RC publishes skip if there are no code changes since the last publish tag. Changes to `package-npm.json` alone (e.g., version bumps) are excluded from this check.

### Patch Releases

The promote flow always bumps `minor + 1` (e.g., `0.8.0` → `0.9.0`). For a patch release:

1. Manually edit `apps/daemon/package-npm.json` to the patch version (e.g., `0.8.1`)
2. Commit and merge to main
3. Trigger RC: `gh workflow run publish-npm.yml -f release_type=rc` → `0.8.1-rc.YYYYMMDD.N`
4. Test, then promote: `gh workflow run publish-npm.yml -f release_type=promote -f promote_version=0.8.1-rc.YYYYMMDD.N` → `0.8.1`
5. The auto-PR will bump to `0.9.0` — close it and set the version manually if you want `0.8.2` instead

### Rollback

```bash
# Deprecate a bad version
npm deprecate @schoolai/shipyard@0.4.0 "Bug in auth, use 0.4.1"

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

The Shipyard plugin (from the GitHub repo) provides hooks and skills. The daemon CLI (`@schoolai/shipyard`) is the npm package under test.

**Step 1: Update plugin for latest hooks/skills**
```bash
/plugin update shipyard@schoolai-shipyard
```

**Step 2: Install the RC daemon**
```bash
npm install -g @schoolai/shipyard@next
```

**Step 3: Verify**
```bash
npm view @schoolai/shipyard@next version   # Should show RC version
shipyard --help                            # Verify CLI works
shipyard login --check                     # Verify auth
```

**Step 4: After testing — revert to stable**
```bash
npm install -g @schoolai/shipyard@latest
```

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
https://www.npmjs.com/package/@schoolai/shipyard/access

### "Version already exists"
The workflow auto-increments a counter suffix (e.g., `.0`, `.1`) to avoid collisions. If this still fails, bump the base version in `apps/daemon/package-npm.json`.

### Nightly didn't run
Check workflow logs for "No changes since..." - it skips if no commits since last tag.

### RC daemon not working
1. Verify RC is installed: `shipyard --help`
2. Check version: `npm view @schoolai/shipyard@next version`
3. Reinstall: `npm install -g @schoolai/shipyard@next`

---

*Last updated: 2026-02-21*
