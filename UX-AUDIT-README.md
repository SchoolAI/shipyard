# Peer-Plan UX Audit: Complete Documentation

## Overview

This directory contains a comprehensive UX audit of the Peer-Plan application's sidebar navigation and view switching behavior. The audit identified **3 major UX issues** causing user confusion around the relationship between the "Inbox" navigation button and the "Needs Review" sidebar section.

**Test Date:** 2026-01-13
**Test Duration:** ~30 minutes automated testing + detailed code analysis
**Status:** All deliverables complete with screenshots and code references

---

## Documents in This Audit

### 1. UX-AUDIT-SUMMARY.md (START HERE)
**Purpose:** Executive summary with actionable recommendations
**Length:** ~4,000 words
**Best For:**
- Quick understanding of the 3 issues
- Implementation roadmap (3 stages)
- Code changes needed
- Testing checklist

**Read This First** if you want to understand:
- What went wrong
- How to fix it (in order of priority)
- How long each fix will take
- Risk assessment

---

### 2. UX-AUDIT-DETAILED-ANALYSIS.md
**Purpose:** Deep dive into root causes and architecture
**Length:** ~6,000 words
**Best For:**
- Understanding WHY the confusion exists
- Seeing exact code locations with line numbers
- Mental model analysis
- Long-term strategic recommendations

**Read This If:** You want to understand the architectural design decisions that led to these issues

---

### 3. UX-AUDIT-REPORT.md
**Purpose:** Automated test results and structured issue log
**Length:** ~2,000 words
**Best For:**
- Quick reference to the 3 issues
- Seeing all screenshots referenced
- Implementation notes

**Read This If:** You want the structured issue list with severity ratings

---

### 4. ux-audit-screenshots/ (Directory)
**Contents:** 7 PNG screenshots capturing the UI in various states
**Size:** ~180 KB total

#### Screenshot Index

| File | What It Shows | Key Observation |
|------|---------------|-----------------|
| 01-initial-state.png | Home page (/) with sidebar | Empty state - no plans in test DB |
| 02-after-inbox-click.png | Inbox page (/inbox) | Sidebar still shows all sections ❌ |
| 03-all-plans-view.png | Back on home page (/) | All plan categories visible |
| 04-filters-expanded.png | Filters accordion expanded | Search and status filters shown |
| 05-after-search.png | After typing "test" in search | Shows search functionality |
| 07-collapsed-sidebar.png | Sidebar collapsed to icons | Icon view with navigation |
| 08-archived-toggle.png | After toggling archive visibility | Archive button state demonstration |

---

## The 3 Issues Summary

### Issue #1: Confusing Terminology (CRITICAL)
**The Problem:**
- Nav bar has button labeled "Inbox"
- Sidebar has section labeled "Needs Review"
- Users don't realize these refer to the same thing

**Quick Fix:** Rename "Needs Review" → "Inbox" (5 minutes)

**Code Location:** `apps/web/src/components/Sidebar.tsx` line 668

---

### Issue #2: Sidebar Context Blindness (MAJOR)
**The Problem:**
- When on Inbox page (/inbox), sidebar still shows "My Plans", "Shared", "Archived"
- These sections are irrelevant to reviewing inbox items
- Causes visual clutter and confusion

**Quick Fix:** Add `!isOnInbox` guards to hide these sections on inbox page (30 minutes)

**Code Location:** `apps/web/src/components/Sidebar.tsx` lines 717, 771, 823

---

### Issue #3: Filters Inconsistency (MAJOR)
**The Problem:**
- Search/filter controls visible on All Plans page (/)
- Hidden on Inbox page (/inbox)
- User can't search inbox items without navigating away

**Decision Needed:** Show search on inbox or make it clearer why it's hidden (1-3 hours to implement)

**Code Location:** `apps/web/src/components/Sidebar.tsx` line 645, `apps/web/src/pages/InboxPage.tsx`

---

## Implementation Roadmap

### Stage 1: Terminology Fix (1 hour)
- Change 1 line of text
- Deploy immediately
- Fixes Issue #1

### Stage 2: Context-Aware Sidebar (2 hours)
- Add 4 `!isOnInbox` guards
- Thorough testing needed
- Fixes Issue #2

### Stage 3: Filter Consistency (2-4 hours)
- Requires product decision
- Add search to inbox OR update UI
- Fixes Issue #3

**Total Time for All Fixes:** 5-10 hours including testing

---

## How to Use This Audit

### For Product Managers
1. Read **UX-AUDIT-SUMMARY.md** completely
2. Look at screenshots to understand the confusion
3. Review "Recommended Fixes" section
4. Make decision on Stage 2 and 3 implementations

### For Designers
1. Review all screenshots in **ux-audit-screenshots/**
2. Read Issue #1 and #2 in **UX-AUDIT-SUMMARY.md**
3. Consider if the UI should clearly indicate:
   - "Inbox" (singular concept) vs browse all plans
   - Visual separation between pages
4. Propose design mockups for context-aware sidebar

### For Developers
1. Read **UX-AUDIT-SUMMARY.md** "Code Changes Summary"
2. Review **UX-AUDIT-DETAILED-ANALYSIS.md** for full context
3. Check code references for exact line numbers
4. Use testing checklist when implementing fixes
5. Refer to **apps/web/src/components/Sidebar.tsx** for changes

### For QA
1. Print/bookmark testing checklist from **UX-AUDIT-SUMMARY.md**
2. Test Stage 1 (should be trivial)
3. Test Stage 2 thoroughly:
   - [ ] Sidebar sections hide/show correctly
   - [ ] Mobile drawer works
   - [ ] Collapsed sidebar works
   - [ ] No visual regressions
4. Test Stage 3 based on implementation choice

---

## Quick Reference: What Users Are Confused About

```
User Path 1: Click "Inbox" button
  └─ Goes to /inbox page
  └─ Sees "Inbox" is highlighted in nav
  └─ But sidebar still shows "My Plans", "Shared", "Archived"
  └─ Confused: "Why am I seeing unrelated plans?"

User Path 2: Looking for review items
  └─ Sees "Inbox" button in nav
  └─ Also sees "Needs Review" section in sidebar
  └─ Confused: "Which one should I click?"
  └─ Are they the same thing?
  └─ If different, which gives me reviews?
  └─ If same, why two different names?

User Path 3: Wants to search inbox
  └─ Goes to /inbox page
  └─ Looks for search box
  └─ Can't find it
  └─ Confused: "How do I search?"
  └─ Has to navigate back to / to search
  └─ Then navigate back to /inbox
```

---

## Architecture Context

### Current Structure
```
App
├─ App.tsx (routing)
├─ Layout (sidebar + main)
├─ Routes:
│  ├─ / (HomePage)
│  │  └─ Sidebar shows all sections + filters
│  │  └─ Main: "Select a plan from the sidebar"
│  │
│  ├─ /inbox (InboxPage)
│  │  └─ Sidebar still shows all sections (CONFUSING)
│  │  └─ Main: Full-page inbox list with action buttons
│  │  └─ No filters visible
│  │
│  └─ /plan/:id (PlanPage)
│     └─ Sidebar highlights selected plan
│     └─ Main: Plan detail view
```

### The Dual Navigation Paradigm
1. **Browse Mode** (`/`) - Use sidebar to find plans
2. **Review Mode** (`/inbox`) - Full-page list for approving/requesting changes

**Problem:** Users don't realize these are two different modes

**Solution:** Make the mode switch obvious through UI changes

---

## Code Structure

### Key Files
- `apps/web/src/components/Sidebar.tsx` (923 lines)
  - Contains all plan sections and filters
  - Conditional logic based on `isOnInbox` flag

- `apps/web/src/pages/InboxPage.tsx` (275 lines)
  - Full-page inbox view
  - Action buttons for approve/request changes

- `apps/web/src/pages/HomePage.tsx` (13 lines)
  - Simple welcome message

- `apps/web/src/App.tsx` (42 lines)
  - Routing configuration

### Key Conditional Logic
```typescript
// Current: Filters only apply on home page
const filteredMyPlans = useMemo(() => {
  if (isOnInbox) return myPlans; // NO filtering on /inbox
  const { filteredPlans } = filterAndSortPlans(...);
  return filteredPlans;
}, [isOnInbox, ...]);

// Similar for: filteredInboxPlans, filteredSharedPlans, filteredArchivedPlans
```

**This design suggests:**
- Inbox page is meant to be a pre-filtered view
- Users shouldn't need to filter further
- **But this intent isn't communicated clearly**

---

## Testing Notes

### Test Environment
- URL: http://localhost:5173
- Test Tool: Playwright (automated)
- Test Database: Empty (no plans)
- Browser: Chromium

### Why No Plans in Test DB?
The test was designed to work with any state (empty or populated). The architectural issues are visible even without plans:
- Sidebar structure is the same
- Filter controls are the same
- Navigation behavior is the same

### For Local Testing
You can test with real plans by:
1. Creating plans via MCP
2. Running manual testing against localhost:5173
3. Following testing checklist in UX-AUDIT-SUMMARY.md

---

## Known Limitations of This Audit

1. **Empty Test Database**
   - Screenshots show empty state
   - But architectural issues are clear from code analysis
   - Real-world testing should be done with actual plans

2. **No Mobile-Specific Testing**
   - Mobile drawer behavior tested (Playwright)
   - But real mobile device testing recommended
   - Touch interaction not thoroughly tested

3. **No User Testing**
   - This is UX audit based on design analysis
   - Real user testing should validate proposed fixes
   - Some assumptions about user expectations may be wrong

4. **No A/B Testing**
   - Recommendations are based on UX best practices
   - A/B test proposed fixes before full rollout
   - Different user groups may have different preferences

---

## Recommended Reading Order

1. **TL;DR (5 minutes):** Read "The 3 Issues Summary" above
2. **Executive (15 minutes):** Read UX-AUDIT-SUMMARY.md completely
3. **Detailed (30 minutes):** Read UX-AUDIT-DETAILED-ANALYSIS.md
4. **Implementation (1 hour):** Code changes + testing checklist

---

## Next Steps

1. **Week 1:** Share audit with team, review findings
2. **Week 1:** Implement Stage 1 (terminology fix) - quick win
3. **Week 2:** Decision on Stage 2 (context-aware sidebar)
4. **Week 2-3:** Implement Stage 2 with thorough testing
5. **Week 3-4:** Decision on Stage 3 (filter consistency)
6. **Week 4+:** Implement Stage 3
7. **After Deploy:** Gather user feedback to validate fixes

---

## Contact & Questions

This audit was generated by automated testing + code analysis on 2026-01-13.

For questions about:
- **The findings:** See UX-AUDIT-DETAILED-ANALYSIS.md
- **Implementation:** See UX-AUDIT-SUMMARY.md "Code Changes Summary"
- **Testing:** See UX-AUDIT-SUMMARY.md "Testing Checklist"
- **Screenshots:** See ux-audit-screenshots/ directory

---

## Files in This Audit

```
UX-AUDIT-README.md (this file)
├─ UX-AUDIT-SUMMARY.md ................. Executive summary & roadmap
├─ UX-AUDIT-DETAILED-ANALYSIS.md ....... Deep dive & architecture
├─ UX-AUDIT-REPORT.md .................. Structured issues
├─ ux-audit-screenshots/ ............... 7 PNG screenshots
│  ├─ 01-initial-state.png
│  ├─ 02-after-inbox-click.png
│  ├─ 03-all-plans-view.png
│  ├─ 04-filters-expanded.png
│  ├─ 05-after-search.png
│  ├─ 07-collapsed-sidebar.png
│  └─ 08-archived-toggle.png
└─ test-ux-audit.js .................... Playwright test code
```

---

## TL;DR Version

**The Problem:**
Two navigation concepts ("Inbox" button + "Needs Review" sidebar) appear to be the same thing but behave differently, confusing users.

**The Solution:**
Three stages:
1. Rename "Needs Review" → "Inbox" (5 min)
2. Hide non-relevant sidebar sections on /inbox page (30 min)
3. Decide on filter consistency strategy (1-3 hours)

**Timeline:** 5-10 hours total including testing

**Risk:** Low (all changes easily reversible)

---

**Audit Generated:** 2026-01-13 05:08 UTC
**Last Updated:** 2026-01-13 05:15 UTC
