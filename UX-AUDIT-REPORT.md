# UX Audit Report: Peer-Plan Sidebar & Navigation

## Executive Summary

The Inbox and All Plans navigation pattern creates confusion because:
1. **Terminology mismatch**: "Inbox" nav item vs "Needs Review" sidebar section
2. **Context inconsistency**: Sidebar and filters behave differently on different pages
3. **Mental model unclear**: Is Inbox a filtered view of all plans or a separate workflow?

---

## Screenshots


### Initial load - Home page with sidebar
![Initial load - Home page with sidebar](01-initial-state.png)


### After clicking Inbox
![After clicking Inbox](02-after-inbox-click.png)


### All Plans view
![All Plans view](03-all-plans-view.png)


### Filters expanded
![Filters expanded](04-filters-expanded.png)


### After searching for "test"
![After searching for "test"](05-after-search.png)


### Collapsed sidebar
![Collapsed sidebar](07-collapsed-sidebar.png)


### After toggling archived plans visibility
![After toggling archived plans visibility](08-archived-toggle.png)


---

## UX Issues (Prioritized by Severity)


### ISSUE-3: Confusing mental model: "Inbox" navigation vs "Inbox" sidebar section

**Severity:** Critical

**Current Behavior:**
Users see "Inbox" as nav item AND see "Needs Review" section in sidebar

**Expected Behavior:**
Either consolidate terminology or make clear that Inbox page != Inbox sidebar section

**Description:**
The nav shows "Inbox" button but sidebar shows "Needs Review" section. Unclear if clicking Inbox takes you to a different place.

---


### ISSUE-4: Filters visibility inconsistent between pages

**Severity:** Major

**Current Behavior:**
Filters shown on All Plans ("/") but hidden on Inbox page ("/inbox")

**Expected Behavior:**
Either show filters on both or make it clear why they're hidden

**Description:**
User would expect to search/filter in any view. Hiding them on Inbox page feels inconsistent.

---


### ISSUE-5: Sidebar sections persist when navigating to Inbox

**Severity:** Major

**Current Behavior:**
My Plans, Shared, and Archived sections still visible on Inbox page

**Expected Behavior:**
Sidebar should change context to show only inbox-relevant controls

**Description:**
Clear mental separation needed: Inbox is a dedicated review inbox, not just filtered all plans view

---


## Root Cause Analysis

### Issue Pattern #1: Dual Navigation Paradigm

The app implements TWO different navigation models:

1. **All Plans** (/) - Sidebar-driven, filtered list view
2. **Inbox** (/inbox) - Dedicated page with action buttons

This creates confusion because:
- "Inbox" in nav bar vs "Needs Review" in sidebar section
- Different control layout on each page
- Filters present on one page, absent on other
- Unclear when to use which

### Issue Pattern #2: Sidebar Context Blindness

The sidebar shows the same sections regardless of which page you're on:
- When on Inbox page, seeing "My Plans" and "Shared" is misleading
- User focus is on reviewing pending items, not browsing their plans
- Should adapt content based on active view

### Issue Pattern #3: Unclear Archive Toggle Semantics

The archive toggle behavior is unclear:
- Does it persist across page navigation?
- Does it apply globally or per-view?
- Visual indicator unclear (sometimes highlighted, sometimes not)

---

## Recommended Fixes (Prioritized)

### CRITICAL: Consolidate Inbox Terminology

**Problem:** Users see both "Inbox" nav and "Needs Review" section

**Option A (Recommended):** Rename "Needs Review" → "Inbox"
- Consolidates terminology
- Makes mental model clear: Inbox = all review items
- Sidebar becomes a browser for all plan types
- Pro: Simpler mental model
- Con: Inbox page becomes redundant (could remove or rename to "Review Details")

**Option B:** Rename nav "Inbox" → "Review Inbox"
- Makes distinction clear
- Pro: Avoids breaking changes
- Con: Wordy, still creates two concepts

**Option C:** Show only Inbox items on Inbox page
- When on /inbox, sidebar shows only inbox plans
- When on /, sidebar shows all categorized plans
- Pro: Clear context switching
- Con: More complex behavior

---

### MAJOR: Context-Aware Sidebar

When on Inbox page (/inbox):
- Hide "My Plans", "Shared", "Archived" sections
- Show only inbox items with action buttons
- Clear visual focus on review actions

When on All Plans page (/):
- Show all plan categories
- Show filters
- Show archive toggle

---

### MAJOR: Consistent Filters Across Views

Either:
1. Show filters on Inbox page (with status pre-filtered to pending_review/changes_requested)
2. Or make clear why filters are only for "All Plans"

Currently inconsistent UX.

---

### MAJOR: Clear Archive Toggle State

- Add label underneath toggle: "Showing archived" / "Hiding archived"
- Or use visual indicator (icon highlight, text label)
- Make toggle effect clear across page navigation

---

## Implementation Recommendation

**Short term (quick win):**
- Rename "Needs Review" section to "Inbox" in sidebar
- This fixes the terminology confusion (ISSUE-3)

**Medium term (architecture):**
- Decide: Is Inbox a sidebar section (Option C) or separate page (Options A/B)?
- Once decided, implement context-aware sidebar behavior
- Add consistent filters across both views

**Long term:**
- User research: How do users expect to review vs browse plans?
- Test both paradigms with real users

---

## Notes for Implementation

1. All screenshots are in: `ux-audit-screenshots/`
2. Current code location: `apps/web/src/components/Sidebar.tsx` and `apps/web/src/pages/InboxPage.tsx`
3. Key mental model code:
   - Lines 452-475: Filter application logic (skipped on Inbox page)
   - Lines 644-656: Filter controls only shown when NOT on Inbox
   - Lines 660-714: "Needs Review" section only shown when NOT on Inbox page

---

Generated: 2026-01-13T05:08:32.236Z
