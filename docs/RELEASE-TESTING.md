# Release Testing Workflow

A systematic approach to testing Shipyard releases.

> **Last tested:** v0.4.0 (2026-01-26)

---

## Two Testing Modes

| Mode | When to Use | What to Skip |
|------|-------------|--------------|
| **Post-Deployment** | Version already published to npm, plugin installed | Build steps, `pnpm dev:all` - go straight to functional testing |
| **Pre-Publish** | Testing local changes before publishing | Nothing - full build verification needed |

### Post-Deployment Testing (You're Here)

If you've already published a version and have the plugin installed:

1. **Skip** all build/install steps (already done by npm/plugin)
2. **Skip** `pnpm dev:all` (MCP server runs via plugin automatically)
3. **Go straight to** [Test Categories](#test-categories) below
4. Use Claude Code with the installed plugin to test MCP tools directly

### Pre-Publish Testing

If testing local changes before publishing, use the [Pre-Release Checklist](#pre-release-checklist) below.

---

## Quick Reference (Pre-Publish Only)

```bash
# Build and test locally
pnpm install && pnpm build && pnpm check

# Start all services
pnpm cleanup && pnpm dev:all

# Run full test suite
pnpm test  # Should see: 695 tests pass (389 schema + 155 server + 151 web)
```

---

## RC Workflow Overview

### How RCs Work

With nightly builds (not per-push), RCs are created on a schedule:

```
Version format: {base-version}-next.{commit-count}
npm tag: @next (NOT @latest)
Example: 0.2.3-next.485
```

RCs are:
- Safe to publish (users must explicitly install `@next`)
- Versioned separately from stable
- Testable via: `npx @schoolai/shipyard-mcp@next`

### Promoting RC to Stable

When confident in an RC:

1. Go to **Actions > Publish to npm > Run workflow**
2. Select action: `promote`
3. Enter RC version: `0.2.3-next.485`
4. Enter stable version: `0.2.3`
5. Run workflow

This:
- Downloads RC tarball from npm
- Re-publishes as stable with `@latest` tag
- Creates git tag and GitHub release

---

## Finding the Delta Between Releases

With nightly builds, understanding what changed since the last release is critical for focused testing.

### Identify Changes

```bash
# Find commits between last release tag and current RC
git log --oneline v0.2.3..HEAD

# Or between two commits
git log --oneline <old-commit>..<new-commit>

# Check what's new to test (last 2 weeks)
git log --oneline --since="2 weeks ago" | head -20
```

### Key Patterns to Look For

| Commit Prefix | What It Means | Testing Priority |
|---------------|---------------|------------------|
| `feat:` | New features | High - needs full testing |
| `fix:` | Bug fixes | Medium - verify the fix works |
| `refactor:` | Code restructuring | Medium - check for regressions |
| `docs:` | Documentation only | Low - no functional testing |
| `test:` | Test changes only | Low - run test suite |

### High-Priority File Changes

Watch for changes in these directories:

- **`apps/server/src/tools/`** - New or modified MCP tools
- **`apps/web/src/components/`** - UI changes needing visual verification
- **`apps/hook/`** - Plan mode behavior changes
- **`packages/schema/`** - Data model changes (may affect everything)

### Quick Delta Check

```bash
# See files changed since last tag
git diff --stat v0.2.3..HEAD

# See just the apps/server/src/tools/ changes
git log --oneline v0.2.3..HEAD -- apps/server/src/tools/
```

---

## Pre-Release Checklist

### Build Verification

- [ ] `pnpm install` - Dependencies install cleanly
- [ ] `pnpm build` - All 7 packages build successfully:
  - `@shipyard/schema` - Core data schemas
  - `@shipyard/shared` - Shared utilities
  - `@shipyard/server` - MCP server
  - `@shipyard/hook` - Plan mode hooks
  - `@shipyard/web` - Web UI
  - `@shipyard/signaling` - WebRTC signaling
  - `@shipyard/github-oauth-worker` - OAuth worker
- [ ] `pnpm check` - All checks pass (test, typecheck, lint)
- [ ] `pnpm test` - All tests pass (target: 695+ tests)

### Hook Build Verification

The hook must build standalone for npx distribution:

```bash
# Verify hook builds independently
pnpm --filter @shipyard/hook build

# Check dist exists and is reasonable size
ls -la apps/hook/dist/index.cjs  # Should be ~300KB+
```

**Common issue:** Hook imports from `@shipyard/schema` can break bundling. If hook fails to build standalone, check for external dependencies that need local copies (see v0.2.3-RC Bug #8).

---

## Test Categories

### 1. Core Functionality Tests

These should work in every RC:

| Test | How to Verify | Pass Criteria |
|------|---------------|---------------|
| Create plan | Ask Claude to create a plan | Browser opens with plan visible |
| Plan content | Check plan in browser | Title, content, checkboxes render |
| Plan sync | Edit in browser | Changes appear in Claude `read_plan` |
| Deliverables | Create plan with `{#deliverable}` markers | Deliverables extracted and listed |

**Test command:**
```
"Create an implementation plan for adding user authentication with a deliverable"
```

### 2. Input System Tests

Test all 8 input types:

| Type | Test Command | Expected Behavior |
|------|--------------|-------------------|
| text | Request API endpoint URL | Single-line text input |
| multiline | Request bug description | Multi-line textarea |
| choice | Ask database preference (3 options) | Radio buttons, "Other" escape hatch |
| confirm | Ask deploy confirmation | Yes/No buttons |
| number | Ask port number (1-65535) | Numeric input with validation |
| email | Request contact email | Email validation |
| date | Ask project deadline | Date picker |
| rating | Ask 1-5 rating | Stars (<=5) or numbers (>5) |

**Test multi-question:**
```typescript
// In execute_code
await requestUserInput({
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Which framework?", type: "choice", options: ["React", "Vue"] }
  ]
})
```

### 3. Activity Timeline Tests

- [ ] Input requests appear in timeline
- [ ] Answered/declined status logged
- [ ] Blocker flag shows red icon (AlertOctagon)
- [ ] Markdown renders in timeline entries

### 4. Artifact Tests

- [ ] Screenshot upload works
- [ ] Video upload works
- [ ] HTML artifact upload works
- [ ] Artifacts link to deliverables
- [ ] Auto-complete when all deliverables have artifacts

### 5. UI Tests

| Area | What to Check |
|------|---------------|
| Inbox | No orphaned sections, correct filtering |
| Kanban | All status transitions work |
| Plan list | Title truncation with tooltips |
| Mobile | Tabs compact, header spacing correct |
| Modals | Markdown renders, inputs functional |

### 6. Integration Tests

- [ ] MCP server connects to web UI
- [ ] Real-time sync between Claude and browser
- [ ] Plan mode hooks fire correctly
- [ ] Session tokens work for authentication

### 7. New Feature Testing

Features added since the last release (check commit logs with `git log --oneline <last-tag>..HEAD`):

| Feature Area | What to Test |
|--------------|--------------|
| Local changes / diff sync | Comments on uncommitted changes sync between machines |
| PR linking | `linkPR` tool works, PR appears in task UI |
| PR creation | Agent can create PRs via gh CLI, link shows in task |
| New MCP tools | Check `apps/server/src/tools/` for new tools to test |
| Activity timeline | `post_update` tool logs messages to timeline |

**How to identify new features:**

```bash
# Find new/modified MCP tools
git log --oneline v0.2.3..HEAD -- apps/server/src/tools/

# Find UI changes
git log --oneline v0.2.3..HEAD -- apps/web/src/

# Find all feat: commits
git log --oneline v0.2.3..HEAD | grep "feat:"
```

### 8. Deliverables & Artifacts Tests

Test the deliverable extraction and artifact upload workflow:

| Test | How to Verify | Pass Criteria |
|------|---------------|---------------|
| Deliverable markers | Create task with `{#deliverable}` in checkbox items | Deliverables extracted and returned in `createTask` response |
| Multiple deliverables | Create task with 3+ deliverable markers | All deliverables appear in `task.deliverables` array |
| Deliverable IDs | Check `createTask` response | Each deliverable has unique `id` and `text` fields |
| Image artifact | Call `addArtifact` with `type: 'image'` | Artifact uploads, appears in task UI |
| HTML artifact | Call `addArtifact` with `type: 'html'` | HTML renders in artifact viewer |
| Video artifact | Call `addArtifact` with `type: 'video'` | Video playable in artifact viewer |
| Artifact linking | Pass `deliverableId` to `addArtifact` | Artifact linked to specific deliverable |
| Auto-complete | Upload artifacts for all deliverables | `allDeliverablesComplete: true` and `snapshotUrl` returned |
| UI rendering | View task in browser | Artifacts display correctly with previews |

**Test commands:**

```typescript
// Create task with deliverables
const task = await createTask({
  title: "Test Deliverables",
  content: `## Implementation
- [ ] Add login page {#deliverable}
- [ ] Add signup page {#deliverable}
- [ ] Screenshot of auth flow {#deliverable}`
});

// Verify deliverables extracted
console.log(task.deliverables);
// Expected: [{ id: "del_xxx", text: "Add login page" }, ...]

// Upload artifact linked to deliverable
const result = await addArtifact({
  taskId: task.taskId,
  sessionToken: task.sessionToken,
  type: 'image',
  filename: 'login-screenshot.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: task.deliverables[0].id,
  description: 'Screenshot of completed login page'
});

// Check auto-complete after all deliverables fulfilled
if (result.allDeliverablesComplete) {
  console.log('Task auto-completed:', result.snapshotUrl);
}
```

**Edge cases to verify:**

- Deliverable markers outside checkbox items (should be ignored)
- Duplicate deliverable text (each should get unique ID)
- Artifact upload without `deliverableId` (should work, not linked)
- Re-uploading artifact for same deliverable (should replace or add?)

### 9. Core Workflow Tests

Essential workflows to verify every release:

#### Share Link Testing

| Test | How to Verify | Pass Criteria |
|------|---------------|---------------|
| Copy share URL | Click share button, copy URL | URL copied to clipboard |
| Open in new browser | Paste URL in incognito/different browser | Task loads correctly |
| Real-time sync | Make change in one window | Change appears in other window |

#### Plan Mode Hooks Testing

| Test | How to Verify | Pass Criteria |
|------|---------------|---------------|
| Enter plan mode | Press Shift+Tab in Claude Code | Plan mode activates |
| Browser auto-open | Create plan content | Browser opens with task automatically |
| Hook blocking | Exit plan mode | Hook blocks until human approval |
| Approval flow | Approve in browser | Claude receives approval, can continue |

#### Sign-In Flow Testing

| Test | How to Verify | Pass Criteria |
|------|---------------|---------------|
| GitHub OAuth | Click sign in | Redirects to GitHub, returns authenticated |
| Account display | Check sidebar after sign-in | Avatar and username shown |
| Sign out | Click sign out | Returns to signed-out state |
| Session persistence | Refresh page while signed in | Stays signed in |

**Known issue:** "Mark as resolved" for diff comments may require page refresh or re-login to update UI - this is a state refresh issue, not a data bug.

---

## Bug Fix Workflow

When bugs are found during RC testing:

### Efficient Bug Filing with Sub-agents

For bugs or documentation issues that don't need immediate fixing, spawn a background sub-agent to file the issue while you continue testing:

**Pattern:**
```
Task: File an issue for [bug description].
First run `gh issue list --limit 10` to understand the repo's issue conventions.
Include:
- Clear reproduction steps
- Expected vs actual behavior
- Priority level (P1=critical, P2=important, P3=nice-to-have)
- Relevant file paths
```

**Why this works:**
- Synchronous testing continues uninterrupted
- Sub-agent learns repo conventions from existing issues
- Issues get proper priority labels
- No context lost - bug is documented immediately

**Example sub-agent prompt:**
```
File a P2 issue for: "Rating input N/A option doesn't submit correctly"
- Check existing issues first with `gh issue list`
- Follow the repo's issue format
- Add label: bug
- Include file: apps/web/src/components/inputs/RatingInput.tsx
```

### 1. Document the Bug

```markdown
**Bug X: [Short description]**
- Observed: [What happened]
- Expected: [What should happen]
- Reproduction: [Steps to reproduce]
- Files likely affected: [paths]
```

### 2. Fix and Verify

```bash
# Make fix
vim apps/web/src/components/SomeComponent.tsx

# Rebuild affected package
pnpm --filter @shipyard/web build

# Run tests
pnpm test

# Test manually in browser
pnpm dev:all
```

### 3. Commit Pattern

```bash
git add [specific files]
git commit -m "fix: comprehensive bug fixes for vX.Y.Z-RC

Fixes N critical bugs found during release candidate testing:

## Bug Fixes

1. [Bug name] - [Brief fix description]
2. [Bug name] - [Brief fix description]
...

Testing: All XXX tests pass

Co-Authored-By: Claude Sonnet 4.5 (1M context) <noreply@anthropic.com>"
```

---

## Bugs Found in v0.2.3-RC

Reference from our testing session (2026-01-25):

### Bug 1: Deliverable 5x Duplication
- **Observed:** Deliverables array grew 5x on each extraction
- **Root cause:** Array not cleared before re-extracting
- **Fix:** `yHelpers.ts` - Clear array before extracting deliverables

### Bug 2: Activity Timeline Not Logging Inputs
- **Observed:** Input request answered/declined not appearing in timeline
- **Root cause:** Missing activity logging in input request handlers
- **Fix:** `input-request-manager.ts` - Add activity logging for answered/declined

### Bug 3: Markdown Not Rendering in Modals
- **Observed:** Raw markdown showing in input request modals
- **Root cause:** Using plain text instead of MarkdownContent component
- **Fix:** All input components - Use `MarkdownContent` for message display

### Bug 4: State Machine Restrictions
- **Observed:** Kanban couldn't transition between all statuses
- **Root cause:** Overly strict state machine transitions
- **Fix:** `KanbanPage.tsx` - Allow all transitions for flexibility

### Bug 5: Rating Input Submission Issues
- **Observed:** N/A and "Other" options not submitting correctly
- **Root cause:** Using Button instead of Radio for special options
- **Fix:** `RatingInput.tsx` - Refactor to use RadioGroup consistently

### Bug 6: Rating HeroUI Compliance
- **Observed:** Rating component not following v3 compound pattern
- **Root cause:** Using flat props pattern from v2
- **Fix:** `RatingInput.tsx` - Full refactor to RadioGroup pattern

### Bug 7: Orphaned Inbox Sections
- **Observed:** Empty agentHelpRequests/Blockers sections showing
- **Root cause:** Sections rendering even when empty after simplification
- **Fix:** `InboxPage.tsx` - Remove orphaned sections entirely

### Bug 8: Execute Code Error Messages
- **Observed:** Errors showing as `[object Object]`
- **Root cause:** Poor error serialization in execute_code tool
- **Fix:** `execute-code.ts` - Better error serialization

### Additional: Hook Build Fix
- **Observed:** Hook couldn't bundle standalone for npx
- **Root cause:** External dependency on `@shipyard/schema` TOOL_NAMES
- **Fix:** Created local `tool-names.ts` copy in shared package

---

## Automation Opportunities

### Where AI Agents Can Help

1. **Running test suites**
   ```bash
   pnpm check  # Full verification
   ```

2. **Checking for regressions**
   - Compare test counts before/after changes
   - Run specific test files for affected areas

3. **Build verification**
   - Confirm all packages build
   - Verify hook bundles standalone

4. **Generating test reports**
   - Capture test output
   - Summarize pass/fail counts

### What Still Needs Human Testing

1. **Visual UI verification** - Layout, colors, responsiveness
2. **Real-time sync behavior** - Timing-sensitive interactions
3. **OAuth flows** - External service integration
4. **Mobile browser testing** - Device-specific behavior
5. **Edge cases** - Unusual input combinations

---

## Testing Checklist Template

Copy this for each RC:

```markdown
## RC Testing: vX.Y.Z-next.NNN

### Pre-Testing
- [ ] Clean environment: `pnpm cleanup`
- [ ] Fresh install: `pnpm install`
- [ ] Build: `pnpm build`
- [ ] All checks pass: `pnpm check`

### Core Features
- [ ] Create plan via MCP
- [ ] Plan renders in browser
- [ ] Real-time sync works
- [ ] Deliverables extract correctly

### Input System
- [ ] text input
- [ ] multiline input
- [ ] choice input (with Other)
- [ ] confirm input
- [ ] number input
- [ ] email input
- [ ] date input
- [ ] rating input
- [ ] Multi-question form

### Activity Timeline
- [ ] Input requests logged
- [ ] Blocker flag works
- [ ] Markdown renders

### Deliverables & Artifacts
- [ ] Create task with deliverables
- [ ] Upload artifact (image)
- [ ] Upload artifact (html)
- [ ] Link artifact to deliverable
- [ ] Auto-complete on all deliverables fulfilled

### Core Workflows
- [ ] Share link works (copy URL, open in new window)
- [ ] Plan mode hooks (Shift+Tab → browser opens)
- [ ] Sign-in/sign-out flow
- [ ] Mobile UI check (inputs, modals, navigation)

### UI Verification
- [ ] Inbox page
- [ ] Kanban transitions
- [ ] Plan list truncation
- [ ] Modal interactions

### Bug Fixes Verified
(List specific bugs from this RC)
- [ ] Bug 1: [description]
- [ ] Bug 2: [description]

### Test Results
- Schema tests: ___/389
- Server tests: ___/155
- Web tests: ___/151
- Total: ___/695

### Ready to Promote?
- [ ] All tests pass
- [ ] Manual testing complete
- [ ] No blocking issues found
```

---

## Lessons Learned

### What Went Well (v0.2.3-RC)

1. **Systematic approach** - Testing by category caught bugs early
2. **Local testing first** - Found issues before publishing RC
3. **Comprehensive commit** - Single commit with all fixes is cleaner
4. **Test suite confidence** - 695 passing tests caught regressions

### What to Improve

1. **Input system complexity** - 8 types each need dedicated testing
2. **HeroUI v3 patterns** - Document compound component requirements
3. **Hook bundling** - Add build verification to CI
4. **Activity timeline** - Needs more automated tests

### Tips for Future RCs

1. **Test the RC package itself** after publishing:
   ```bash
   npx -y -p @schoolai/shipyard-mcp@next mcp-server-shipyard
   ```

2. **Clear browser state** between tests:
   ```
   http://localhost:5173/?reset=all
   ```

3. **Check hook debug logs** for issues:
   ```bash
   tail -f ~/.shipyard/hook-debug.log
   ```

4. **Verify real-time sync** by opening two browser tabs

---

*Document created: 2026-01-25 from v0.2.3-RC testing session*
