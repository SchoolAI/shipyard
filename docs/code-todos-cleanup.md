# Code TODO Cleanup Backlog

Items tracked here can be done incrementally during refactoring.

**Note:** This document tracks lower-priority code TODOs that don't warrant GitHub issues. These can be addressed during opportunistic refactoring.

---

## Shared Code Extraction (Remaining)

After completing session-token and registry-config extraction, these TODOs remain:

- [ ] **Review `apps/hook/src/core/review-status.ts:5`** - "i think a lot of this is shared with the server and should be centralized"
  - Complex logic (~400 lines) with Y.Doc observation
  - Need to audit: which parts are truly duplicated in server?
  - Only extract what's actually shared (don't extract hook-specific code)
  - May not be duplicated - verify before extracting

- [ ] **Review `apps/hook/src/core/plan-manager.ts:5`** - "is some of this shared by the mcp server?"
  - Plan creation logic
  - Check server's create-plan tool for overlap
  - Extract only truly duplicated functions

---

## Logging Improvements

- [ ] **Review `~/.peer-plan/hook-debug.log`** (apps/hook/src/logger.ts:15)
  - Action: Review debug log for recurring warnings/errors
  - Fix any issues that appear frequently
  - Consider log rotation if file grows large

- [ ] **Add file logging to MCP server** (apps/server/src/logger.ts:4-5)
  - Action: Add parity with hook (file + stderr logging)
  - Helpful for debugging MCP server issues
  - Use same pattern as hook: `~/.peer-plan/server-debug.log`

---

## Minor Cleanups

- [ ] **Remove deprecated `PEER_PLAN_WEB_URL`** (apps/hook/src/config/env/web.ts:5)
  - Marked as deprecated in schema
  - Check if still used anywhere
  - Remove if safe

- [ ] **Centralize SessionStart context** (apps/hook/src/index.ts:227)
  - Currently duplicated between hook and skill
  - Move to shared location or rely entirely on skill
  - Low priority - only matters when updating documentation

- [ ] **Add sidebar search functionality** (apps/web/src/components/Sidebar.tsx:256)
  - Search icon exists but does nothing when clicked
  - Could open a search modal or focus the existing search input
  - Quick win if current filters aren't sufficient

- [ ] **Platform detection for P2P peers** (apps/web/src/hooks/useP2PPeers.ts:64)
  - Currently hardcoded to `'browser'`
  - Could detect: claude-code, cursor, devin, browser, etc.
  - Cosmetic enhancement - low priority

- [ ] **Mark notifications as M11+ feature** (apps/web/src/components/NotificationsButton.tsx:17)
  - Button exists but functionality not implemented
  - Add comment marking as future milestone
  - Or remove button until ready to implement

---

## Registry Server Refactoring (Future)

When doing major refactor of registry server:

- [ ] **Reduce complexity in initPersistence** (apps/server/src/registry-server.ts:139)
  - Function is complex with lock handling and stale cleanup
  - Could be split into smaller, testable functions
  - Consider adding tests before refactoring

- [ ] **Simplify server architecture** (apps/server/src/registry-server.ts:748-751)
  - 750+ line file with 16 HTTP routes
  - Options:
    - Express Router for route organization
    - tRPC for RPC-style routes (see GitHub issue #5)
    - Middleware for common HTTP patterns
  - Related to tRPC migration discussion

---

## Completed / No Longer Applicable

These were addressed or determined to be unnecessary:

- ✅ **Session token duplication** - Extracted to `packages/shared`
- ✅ **Registry config duplication** - Extracted to `packages/shared`
- ✅ **API route type safety** - Added shared route constants
- ✅ **Fail-open error handling** - Fixed to fail-closed where appropriate
- ✅ **Approval comment injection** - Added to PostExit hook
- ✅ **CLAUDE_PLANS_DIR constant** - Deleted (dead code)
- ✅ **GitHub username cache expiration** - Determined unnecessary (false positive)

---

*Last updated: 2026-01-16*
