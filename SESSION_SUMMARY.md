# Session Summary: GitHub Identity & Ownership Model

**Date:** 2026-01-08
**Status:** ✅ Complete and Pushed

---

## What Was Completed

### Milestone 9: GitHub Identity Integration ✅

Successfully replaced random server/browser IDs with verified GitHub usernames for plan ownership and approval.

#### Server Side
- ✅ Server now uses `gh api user` to get GitHub username as `ownerId`
- ✅ Throws helpful error if `gh auth login` not run
- ✅ Caches username per process
- **File:** `apps/server/src/server-identity.ts`

#### Browser Side
- ✅ GitHub OAuth Web Flow authentication (redirect-based, no Device Flow CORS issues)
- ✅ Cloudflare Worker for token exchange (`apps/github-oauth-worker/`)
- ✅ Account UI in sidebar footer (avatar + dropdown menu)
- ✅ Sign in, sign out, switch account functionality
- ✅ Account picker prompt (`prompt=select_account`) for proper account switching
- **Key files:**
  - `apps/web/src/hooks/useGitHubAuth.ts` - OAuth hook
  - `apps/web/src/utils/github-web-flow.ts` - OAuth Web Flow logic
  - `apps/web/src/components/account/` - Account UI (5 components)

#### Infrastructure
- ✅ Cloudflare Worker: `apps/github-oauth-worker/`
  - Proxies GitHub token exchange (browser can't do it directly due to CORS)
  - Runs locally on port 4445
  - Ready for production deployment
- ✅ GitHub OAuth App registered: `Ov23liNnbDyIs6wu4Btd`
- ✅ Added to `pnpm dev:all` script

### Milestone 8: Waiting Room (In Progress)

Core components implemented, waiting room functional but currently disabled via feature flag.

#### Completed
- ✅ Schema: `ownerId`, `approvalRequired`, `approvedUsers` fields
- ✅ Helper functions: `isUserApproved()`, `approveUser()`, `revokeUser()`
- ✅ Awareness protocol integration for real-time approval status
- ✅ `WaitingRoomGate` component (shows waiting room for pending users)
- ✅ Approval logic uses GitHub username for checks

#### Pending
- ⏳ Owner Approval Panel (UI for owner to approve/deny pending users)
- ⏳ Signaling server enforcement (server-side CRDT gating)

---

## Testing Instructions

### Local Testing Setup

**1. Start all services:**
```bash
pnpm dev:all
```

This starts:
- MCP server (dynamic port)
- WebRTC signaling (port 4444)
- **GitHub OAuth worker (port 4445)** ← NEW
- Web app (port 5173)
- Hook handler

**2. Test GitHub Login:**
1. Open http://localhost:5173
2. Look for "Sign in with GitHub" button in sidebar (bottom left)
3. Click it → redirects to GitHub
4. Authorize the app
5. Redirects back → should see your GitHub avatar + username

**3. Test Account Menu:**
1. Click your avatar in sidebar
2. Dropdown shows:
   - Your display name
   - @username
   - View GitHub Profile (opens GitHub)
   - Switch Account (shows account picker)
   - Sign Out (clears auth)

**4. Test Plan Ownership:**
1. Create a plan via MCP: `create_plan`
2. Plan should have `ownerId` set to your GitHub username
3. Open in browser → you should be auto-approved (you're the owner)
4. Share URL with different browser/profile → they should see waiting room

### Production Deployment (When Ready)

**GitHub OAuth Worker:**
```bash
cd apps/github-oauth-worker

# Set production secrets
pnpm secret:client-id      # Enter: Ov23liNnbDyIs6wu4Btd
pnpm secret:client-secret  # Enter: (from GitHub OAuth App settings)

# Deploy
pnpm deploy
```

Worker will be at: `https://peer-plan-github-oauth.jacob-191.workers.dev`

Update `apps/web/.env.production`:
```
VITE_GITHUB_OAUTH_WORKER=https://peer-plan-github-oauth.jacob-191.workers.dev
```

---

## Known Issues & Limitations

### 1. Switch Account Auto-Logs Same User

**Issue:** GitHub sees you're logged in and auto-approves same account.

**Fix Implemented:** Added `prompt=select_account` parameter. GitHub now shows account picker.

**If still auto-logging:** You may need to log out of GitHub first, or use incognito/different browser.

### 2. Waiting Room Currently Disabled

**Feature flag:** `VITE_DISABLE_WAITING_ROOM=true` in `.env.development`

**Why:** Testing GitHub auth flow without approval blocking.

**To enable:** Remove the line from `.env.development` and restart dev server.

### 3. Remote Agents (Devin, etc.)

**Current:** Agents without `gh` CLI will fail when calling `create_plan`.

**Workaround:** They need to either:
- Have `gh auth login` run in their environment
- OR set `GITHUB_TOKEN` env var (not implemented yet)
- OR pass `ownerId` parameter (not implemented yet)

**Future:** Add support for `GITHUB_TOKEN` env var fallback.

---

## Architecture Summary

### Two Security Layers

**1. Session Token (MCP Authorization)**
- Purpose: Prevent one MCP session from modifying another's plans
- Stored as: `sessionTokenHash` in plan metadata
- Validates: "Is this the MCP that created this plan?"

**2. GitHub Identity (Human Ownership)**
- Purpose: Plan ownership and approval for human reviewers
- Stored as: `ownerId` (GitHub username) in plan metadata
- Validates: "Which human owns this plan and who can view it?"

Both layers work together - session token gates MCP tool calls, GitHub username gates browser viewing/editing.

### OAuth Flow

```
Browser                    Cloudflare Worker         GitHub
   |                              |                     |
   | 1. Click "Sign in"           |                     |
   | 2. Redirect to GitHub        |                     |
   |-------------------------------->------------------>|
   |                              |                     |
   | 3. User authorizes           |                     |
   |<--------------------------------<-------------------|
   |    ?code=abc123&state=xyz    |                     |
   |                              |                     |
   | 4. POST /token-exchange      |                     |
   |    { code, redirect_uri }    |                     |
   |----------------------------->|                     |
   |                              | 5. POST /access_token
   |                              |   + client_secret   |
   |                              |-------------------->|
   |                              |                     |
   |                              | 6. { access_token } |
   |                              |<--------------------|
   |                              |                     |
   | 7. { access_token }          |                     |
   |<-----------------------------|                     |
   |                              |                     |
   | 8. GET /user                 |                     |
   |-------------------------------------------------->|
   |                              |                     |
   | 9. { login, name, avatar }   |                     |
   |<--------------------------------------------------|
   |                              |                     |
   | 10. Store in localStorage    |                     |
```

---

## Commits Pushed (10 total)

1. `ca4b597` - feat(schema): add access control fields for waiting room (M8 Phase 1)
2. `2906799` - refactor(schema): remove noisy comments per engineering standards
3. `cf16c66` - feat(server): set ownerId when creating plans (M8 Phase 6 - replaced in M9)
4. `8c96960` - docs(milestone): mark Phase 1, 2, and 6 as complete (M8)
5. `6c980dd` - feat(web): add waiting room gate component (M8 Phase 3)
6. `bc722b0` - feat(web): add feature flag to disable waiting room for testing
7. `73c121c` - feat(server): use GitHub username as ownerId (M9 Phase 1)
8. `4c522c1` - feat(web): add GitHub Device Flow authentication (M9 Phase 2 - replaced by Web Flow)
9. `617dc96` - refactor(web): convert GitHub auth from Device Flow to Web Flow
10. `c675285` - feat(worker): add GitHub OAuth token exchange Cloudflare Worker

Plus additional commits for:
- Account UI integration
- Account picker prompt
- Milestone documentation updates
- Infrastructure (dev:all script, .gitignore, etc.)

---

## Next Steps (For Tomorrow)

### Immediate
1. **Test the full flow** - Create plan, view it, see your GitHub avatar
2. **Enable waiting room** - Remove `VITE_DISABLE_WAITING_ROOM` from .env.development
3. **Test cross-device** - Share URL with different browser, verify waiting room works

### Future (Milestone 8 completion)
1. **Owner Approval Panel** - UI for owner to approve/deny pending users
2. **Signaling Server Enforcement** - Server-side CRDT gating (prevents client-side bypass)
3. **MCP Tools** - `approve_user`, `list_pending` tools for CLI approval

### Nice to Have
1. **Anonymous viewing** - Allow viewing public plans without GitHub auth
2. **Better switch account UX** - Add tooltip explaining GitHub logout requirement
3. **Token status display** - Show when user signed in
4. **Error handling improvements** - Better UX for expired tokens, network errors

---

## Files Modified Summary

**Created:**
- `apps/github-oauth-worker/` - Entire Cloudflare Worker package
- `apps/web/src/components/account/` - 5 account UI components
- `apps/web/src/utils/github-web-flow.ts` - OAuth Web Flow logic
- `apps/web/src/utils/color.ts` - Color generation from username
- `docs/designs/github-login-settings-ui.md` - Design spec
- `docs/milestones/09-github-identity.md` - Implementation plan

**Modified:**
- `apps/server/src/server-identity.ts` - GitHub username from gh CLI
- `apps/web/src/hooks/useGitHubAuth.ts` - Web Flow implementation
- `apps/web/src/hooks/useMultiProviderSync.ts` - Uses GitHub username for approval
- `apps/web/src/components/Sidebar.tsx` - Integrated account UI
- `apps/web/.env.development` - Added CLIENT_ID and WORKER_URL
- `package.json` - Added github-oauth worker to dev:all
- `.gitignore` - Added .wrangler/ and .env.development exceptions
- `docs/milestones/PROGRESS.md` - Updated progress

**Total:** ~50 files created/modified across the session

---

## Research Completed

Investigated how industry tools handle GitHub identity:
- **Devin:** GitHub App OAuth, configurable commit identity, user owns all
- **Lovable:** GitHub App OAuth, commits as bot, user owns all
- **Replit:** GitHub OAuth, commits as user, multiplayer git support
- **Claude Code:** Local git config, adds Co-Authored-By trailer

**Key insight:** Everyone uses GitHub OAuth to learn user's identity. We followed industry standard.

---

## Current State

**Server:** ✅ Uses GitHub username as `ownerId`
**Browser:** ✅ GitHub OAuth working, you're logged in
**Waiting Room:** ⏸️ Disabled for testing, ready to enable
**Ownership Model:** ✅ Complete - verified GitHub usernames
**Session Tokens:** ✅ Implemented for MCP-to-MCP isolation

**You're logged in as:** Your GitHub account (you confirmed this during testing)

---

**All work pushed to `main` branch. Sleep well!**

*Session completed: 2026-01-08 01:20 MST*
