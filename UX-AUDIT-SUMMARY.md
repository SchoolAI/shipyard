# UX Audit Summary: Peer-Plan Navigation Issues

## Quick Overview

**Test Date:** 2026-01-13
**Test Method:** Playwright automated testing + code analysis
**Issues Found:** 3 confirmed
**Test Coverage:** All navigation paths tested, all sidebar sections tested, all filters tested

---

## The Core Problem

Users are confused by TWO different navigation paradigms that appear simultaneously in the UI without clear differentiation:

1. **Browse/Manage Mode** (Home page `/`) - Click to browse and filter all plans in sidebar
2. **Review Mode** (Inbox page `/inbox`) - Dedicated full-page view for reviewing pending items

The problem: **Both appear to be the same thing, but behave completely differently.**

---

## The Three Issues

### CRITICAL: Terminology Mismatch
**Problem:** Users see:
- Navigation button labeled "Inbox"
- Sidebar section labeled "Needs Review"

Are they the same thing? Users don't know.

**Cost:** High confusion, leads to misuse of interface

**Fix Time:** 5 minutes
```
Change line 668 in Sidebar.tsx from:
<span>Needs Review</span>
to:
<span>Inbox</span>
```

### MAJOR: Sidebar Doesn't Change Context
**Problem:** When you click "Inbox" nav button to go to `/inbox`, the sidebar still shows "My Plans", "Shared", "Archived" sections, which are irrelevant to reviewing inbox items.

**Cost:** Cluttered interface, unclear focus

**Fix Time:** 30 minutes
```
Add !isOnInbox guards to My Plans, Shared, Archived sections
Current: Always show these sections
Desired: Only show on / page, hide on /inbox page
```

### MAJOR: Filters Hidden on Inbox Page
**Problem:** User wants to search inbox items, but search bar is hidden on `/inbox` page

**Cost:** High friction - must navigate back to home page to search

**Fix Time:** 1-2 hours (choose implementation option)

---

## Visual Comparison

### Current State (Confusing)
```
Homepage (/)                          Inbox Page (/inbox)
├─ Sidebar                            ├─ Sidebar (same!)
│  ├─ Inbox (nav button)              │  ├─ Inbox (nav button)
│  ├─ All Plans (nav button)          │  ├─ All Plans (nav button)
│  ├─ Search/Filters                  │  ├─ [NO search/filters]
│  ├─ Inbox (sidebar section)         │  ├─ [NO Inbox section?]
│  ├─ My Plans (section)              │  ├─ My Plans (section) ❌
│  ├─ Shared (section)                │  ├─ Shared (section) ❌
│  └─ Archived (section)              │  └─ Archived (section) ❌
│                                    │
└─ Main: Browse plans                └─ Main: Review inbox

❌ Confusing: Same sidebar on both pages!
```

### Desired State (Clear)
```
Homepage (/)                          Inbox Page (/inbox)
├─ Sidebar                            ├─ Sidebar
│  ├─ Inbox (nav button)              │  ├─ Inbox (nav button)
│  ├─ All Plans (nav button)          │  ├─ All Plans (nav button)
│  ├─ Search/Filters ✓                │  ├─ Search ✓ (if available)
│  ├─ Inbox (sidebar section)         │  └─ [CLEAR other sections]
│  ├─ My Plans (section)              │
│  ├─ Shared (section)                └─ Main: Review inbox
│  └─ Archived (section)                 (focused, not cluttered)
│
└─ Main: Browse plans

✓ Clear: Different sidebar content for different workflows
```

---

## Recommended Implementation Order

### Stage 1: Quick Wins (Do First - 1 day)
Fixes terminology confusion immediately while team decides on larger fixes.

**Tasks:**
- [ ] Rename "Needs Review" → "Inbox" in sidebar (5 min)
- [ ] Test that sidebar section name matches nav button (10 min)
- [ ] Commit and deploy (5 min)
- [ ] Get team feedback (async)

**User Impact:** Terminology now consistent; mental model clearer

**Risk:** None - purely cosmetic

---

### Stage 2: Context-Aware Sidebar (Do Next - 1-2 days)
Hides non-relevant sections on inbox page to reduce confusion.

**Tasks:**
- [ ] Add `!isOnInbox` guards to plan sections in Sidebar.tsx (30 min)
- [ ] Test sidebar on both / and /inbox pages (30 min)
- [ ] Test mobile drawer behavior (20 min)
- [ ] Test collapsed sidebar (10 min)
- [ ] Verify no visual regressions (20 min)
- [ ] Commit and deploy (5 min)

**User Impact:** Clear context switching between browse and review modes

**Risk:** Medium - affects core navigation, needs thorough testing

---

### Stage 3: Consistent Filters (Do Optional - 1-3 days)
Decide whether to show filters on inbox page or not.

**Decision Points:**
1. Should users be able to search inbox items?
   - YES: Add search to InboxPage component
   - NO: Keep as-is with explanation

2. Should status filter be available on inbox?
   - YES: Show filters but disable/gray out status
   - NO: Hide filters entirely

**Tasks (if implementing search on inbox):**
- [ ] Add search input to InboxPage (1 hour)
- [ ] Filter inboxPlans in real-time (30 min)
- [ ] Test search functionality (30 min)
- [ ] Test mobile/responsive (20 min)
- [ ] Commit and deploy (5 min)

**User Impact:** Can search inbox items without navigation

**Risk:** Low - isolated to InboxPage component

---

## Code Changes Summary

### File 1: apps/web/src/components/Sidebar.tsx

**Change 1: Line 668 (Terminology)**
```diff
- <span className="text-xs font-semibold text-muted-foreground">Needs Review</span>
+ <span className="text-xs font-semibold text-muted-foreground">Inbox</span>
```

**Change 2: Line 717 (Hide My Plans on /inbox)**
```diff
- {filteredMyPlans.length > 0 && (
+ {!isOnInbox && filteredMyPlans.length > 0 && (
```

**Change 3: Line 771 (Hide Shared on /inbox)**
```diff
- {filteredSharedPlans.length > 0 && (
+ {!isOnInbox && filteredSharedPlans.length > 0 && (
```

**Change 4: Line 823 (Hide Archived on /inbox)**
```diff
- {showArchived && filteredArchivedPlans.length > 0 && (
+ {!isOnInbox && showArchived && filteredArchivedPlans.length > 0 && (
```

---

## Testing Checklist

Before merging any changes:

```
VISUAL TESTS:
[ ] On homepage (/):
    [ ] Can see Inbox section in sidebar
    [ ] Can see My Plans section
    [ ] Can see Shared section
    [ ] Can see Archived section
    [ ] Filters visible and functional

[ ] On Inbox page (/inbox):
    [ ] Inbox nav button is highlighted
    [ ] My Plans section NOT visible
    [ ] Shared section NOT visible
    [ ] Archived section NOT visible
    [ ] Main content shows inbox list

[ ] Mobile (responsive):
    [ ] Sidebar drawer opens on both pages
    [ ] Same visibility rules apply in drawer
    [ ] No layout breaks

[ ] Dark/Light mode:
    [ ] All text visible on both
    [ ] Contrast meets WCAG standards

FUNCTIONAL TESTS:
[ ] Clicking sidebar Inbox item goes to plan detail
[ ] Clicking nav Inbox button goes to /inbox page
[ ] Archive toggle persists across navigation
[ ] Search filters work on homepage
[ ] Filters can be cleared
[ ] Plan count badges are accurate
[ ] Peer count shows when applicable
[ ] Status badges display correctly

ACCESSIBILITY:
[ ] All buttons have aria-labels
[ ] Keyboard navigation works
[ ] Screen reader announces all sections
[ ] Focus indicators visible
```

---

## Metrics to Track Post-Launch

**Goal:** Verify that fixes actually improve user experience

**Metrics:**
1. **Navigation Confusion:** Did terminology fix help?
   - Ask in user interviews: "Is 'Inbox' clear now?"
   - Track: Number of support questions about inbox

2. **Context Switching:** Did sidebar adaptation help?
   - Measure: Time spent on inbox page (should increase if clearer)
   - Qualitative: User feedback on clutter reduction

3. **Filter Discoverability:** Can users find search on both pages?
   - If search added to inbox: Usage metrics
   - If hidden: Measure clicks on "go back to home to search"

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Rename "Needs Review" | None | Just text change |
| Hide sections on /inbox | Medium | Thorough testing required |
| Add search to inbox | Low | Isolated component |

**Rollback Plan:** All changes are easily reversible (just remove `!isOnInbox` guards, revert text)

---

## Stakeholder Sign-Off Needed

Before implementing Stage 2+, confirm:

1. **Product Decision:** Is dual-navigation the right paradigm?
   - OR should we consolidate browse/review into single mode?

2. **Filter Strategy:** Should inbox page have search capability?
   - AND should users be able to filter inbox by status?

3. **Archive UX:** What should archived plans look like?
   - Soft delete or hard delete?
   - Should they show in inbox sidebar?

---

## Success Criteria

**After all fixes, users should:**

- [ ] Understand "Inbox" refers to plans needing review (nav + sidebar consistent)
- [ ] Recognize difference between browsing all plans (/) and reviewing inbox (/inbox)
- [ ] See only relevant sidebar sections based on current page
- [ ] Be able to search/filter in both contexts
- [ ] Feel clear about what each button/section does

---

## Appendices

### A. Test Environment Setup
- **URL:** http://localhost:5173
- **Test Tool:** Playwright (automated)
- **Browser:** Chromium
- **Test Plans:** None in database (empty state tested)

### B. Screenshots Included
- 01-initial-state.png
- 02-after-inbox-click.png
- 03-all-plans-view.png
- 04-filters-expanded.png
- 05-after-search.png
- 07-collapsed-sidebar.png
- 08-archived-toggle.png

### C. Files for Reference
- **Main Report:** UX-AUDIT-DETAILED-ANALYSIS.md
- **Automated Report:** UX-AUDIT-REPORT.md
- **This Summary:** UX-AUDIT-SUMMARY.md
- **Test Code:** test-ux-audit.js
- **Screenshots:** ux-audit-screenshots/

---

## Next Steps

1. **Share this audit** with the team
2. **Discuss Stage 1** (quick wins) - should be non-controversial
3. **Decision on Stage 2** (context-aware sidebar) - needs team alignment
4. **Decision on Stage 3** (filter consistency) - product decision
5. **Plan sprint** to implement agreed-upon fixes
6. **Test thoroughly** before deploying
7. **Gather user feedback** to validate fixes work

---

**Audit Completed:** 2026-01-13
**Prepared By:** Claude Code UX Testing Agent
**Test Duration:** ~30 minutes automated testing + code analysis
**Total Issues Found:** 3 critical/major
