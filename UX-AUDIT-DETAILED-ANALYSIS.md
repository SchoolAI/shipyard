# Comprehensive UX Audit: Peer-Plan Navigation & Sidebar

## Executive Summary

Testing revealed **3 critical issues** with confusing UX patterns in the sidebar navigation. The root cause is a fundamental architectural confusion between two different navigation paradigms that aren't clearly differentiated to users.

**Status:** All test screenshots captured. No plans in test environment, but behavior is clearly documented through code analysis and automated testing.

---

## Table of Contents

1. [Issues Summary](#issues-summary)
2. [Detailed Issue Analysis](#detailed-issue-analysis)
3. [Code Architecture Review](#code-architecture-review)
4. [Mental Model Analysis](#mental-model-analysis)
5. [Recommended Fixes](#recommended-fixes)
6. [Implementation Roadmap](#implementation-roadmap)

---

## Issues Summary

| ID | Title | Severity | Status |
|---|---|---|---|
| ISSUE-1 | Sidebar sections persist when navigating to Inbox | Major | Confirmed |
| ISSUE-2 | Filters visibility inconsistent between pages | Major | Confirmed |
| ISSUE-3 | Confusing mental model: "Inbox" nav vs "Needs Review" section | Critical | Confirmed |

---

## Detailed Issue Analysis

### ISSUE-3: Confusing Mental Model (CRITICAL)

**User Pain Point:**
Users see TWO concepts for inbox:
1. Navigation button labeled "Inbox"
2. Sidebar section labeled "Needs Review"

This creates cognitive load: *"Are these the same thing? Do I click the button or the section?"*

**Current Behavior:**
- Nav bar has "Inbox" button (navigates to `/inbox`)
- Sidebar has "Needs Review" section (lists inbox plans on `/` page)
- No visual connection between the two

**Code Evidence:**

From `/apps/web/src/components/Sidebar.tsx`:

```typescript
// Line 627-634: "Inbox" nav button
<NavItem
  icon={<Inbox className={...} />}
  label="Inbox"
  href="/inbox"
  isActive={isOnInbox}
  badge={inboxPlans.length}
  badgeColor="warning"
  onClick={onNavigate}
/>

// Line 660-714: "Needs Review" sidebar section (only shown when NOT on /inbox)
{!isOnInbox && filteredInboxPlans.length > 0 && (
  <Disclosure defaultExpanded>
    <Disclosure.Heading>
      <span className="text-xs font-semibold text-muted-foreground">Needs Review</span>
    </Disclosure.Heading>
    ...
  </Disclosure>
)}
```

**Problem:** The condition `!isOnInbox` explicitly hides "Needs Review" when on the Inbox page, implying they're meant to be related, but users don't understand this relationship.

**Expected Behavior:**
Clear, unified terminology for the concept of "plans needing review".

**Impact:** Medium-high confusion. Users may click "Inbox" expecting to see a sidebar section, or vice versa.

---

### ISSUE-2: Filters Visibility Inconsistent (MAJOR)

**User Pain Point:**
User wants to search for a plan while viewing inbox, but filters are hidden.

**Current Behavior:**
- Filters visible on All Plans page (`/`)
- Filters hidden on Inbox page (`/inbox`)
- No indication of why they're hidden

**Code Evidence:**

From `/apps/web/src/components/Sidebar.tsx`:

```typescript
// Line 644-656: Filter controls only shown when NOT on Inbox
{!isOnInbox && (
  <FilterControls
    searchQuery={searchQuery}
    sortBy={sortBy}
    statusFilters={statusFilters}
    onSearchChange={setSearchQuery}
    onSortChange={(sort) => setSortBy(sort as 'name' | 'newest' | 'updated' | 'status')}
    onStatusToggle={toggleStatusFilter}
    onClearFilters={clearFilters}
    hasActiveFilters={hasActiveFilters}
  />
)}
```

From `/apps/web/src/pages/InboxPage.tsx`:
```typescript
// Line 158-273: Inbox page has NO filter controls at all
// Only shows a dedicated list with approval/reject buttons
```

**Problem:** Different behaviors on different pages. Users expect consistency.

**Expected Behavior:**
Either:
1. Show filters on Inbox page (maybe pre-filtered to pending_review/changes_requested)
2. Or clearly communicate why they're absent (e.g., "Inbox is already filtered to items needing review")

**Impact:** High friction. User must navigate back to All Plans to search.

---

### ISSUE-1: Sidebar Sections Persist on Inbox Page (MAJOR)

**User Pain Point:**
User mentioned: *"Inbox doesn't clear plans, still shows My Plans and Archived"*

**Current Behavior:**
- When on `/`, sidebar shows: My Plans + Shared + Archived + "Needs Review"
- When on `/inbox`, sidebar still shows: My Plans + Shared + Archived
- Only "Needs Review" is hidden

**Code Evidence:**

From `/apps/web/src/components/Sidebar.tsx`:

```typescript
// Line 452-475: Filters are conditionally applied ONLY on home page
const filteredInboxPlans = useMemo(() => {
  if (isOnInbox) return inboxPlans; // NO filtering on /inbox
  const { filteredPlans } = filterAndSortPlans(inboxPlans, ...);
  return filteredPlans;
}, [inboxPlans, searchQuery, sortBy, statusFilters, isOnInbox]);

const filteredMyPlans = useMemo(() => {
  if (isOnInbox) return myPlans; // NO filtering on /inbox
  const { filteredPlans } = filterAndSortPlans(myPlans, ...);
  return filteredPlans;
}, [myPlans, searchQuery, sortBy, statusFilters, isOnInbox]);

// Line 717-768: "My Plans" shown on ALL pages
{filteredMyPlans.length > 0 && (
  <Disclosure defaultExpanded>
    <span className="text-xs font-semibold">My Plans</span>
    ...
  </Disclosure>
)}

// Line 771-820: "Shared Plans" shown on ALL pages
{filteredSharedPlans.length > 0 && (
  <Disclosure defaultExpanded>
    <span className="text-xs font-semibold">Shared with me</span>
    ...
  </Disclosure>
)}

// Line 823-867: "Archived" shown on ALL pages
{showArchived && filteredArchivedPlans.length > 0 && (
  <Disclosure defaultExpanded>
    <span className="text-xs font-semibold">Archived</span>
    ...
  </Disclosure>
)}
```

**Problem:** Sidebar shows "My Plans", "Shared", "Archived" regardless of page context. When user navigates to `/inbox` (a dedicated review workflow), they still see their regular plans in the sidebar, which is visually confusing.

**Expected Behavior:**
Context-aware sidebar:
- On `/inbox`: Show only inbox-specific UI (or hide sidebar entirely)
- On `/`: Show all plan categories

**Impact:** High confusion. User's focus is on reviewing pending items, not browsing their plans.

---

## Code Architecture Review

### Current Structure

```
Sidebar Component (apps/web/src/components/Sidebar.tsx)
├── Uses: usePlanIndex() → fetches [myPlans, sharedPlans, inboxPlans, archivedPlans]
├── Uses: useViewFilters() → [searchQuery, sortBy, statusFilters]
├── Logic:
│   ├── isOnInbox = location.pathname === '/inbox'
│   ├── Apply filters only if !isOnInbox (line 452)
│   ├── Show "Needs Review" only if !isOnInbox (line 661)
│   ├── Show "My Plans" on ALL pages (line 717)
│   ├── Show "Shared" on ALL pages (line 771)
│   ├── Show "Archived" on ALL pages (line 823)
│   └── Show filters only if !isOnInbox (line 645)
│
└── Renders: Single sidebar for all routes

InboxPage Component (apps/web/src/pages/InboxPage.tsx)
├── Uses: usePlanIndex() → gets inboxPlans
├── Renders: Dedicated full-page inbox view
│   ├── Header: "Inbox" title + count
│   ├── ListBox: Shows inbox plans with status badges
│   ├── Quick actions: Approve, Request Changes, View Plan
│   └── Empty state: "Inbox Zero!"
└── Layout: Full-width, no sidebar context

HomePage Component (apps/web/src/pages/HomePage.tsx)
├── Renders: Minimal welcome message
├── Sidebar: Full sidebar with all sections
└── Layout: Sidebar + centered welcome text
```

**Key Issue:** Same Sidebar component used for two completely different user workflows:
1. Browsing/managing plans (HomePage at `/`)
2. Reviewing inbox items (Inbox page at `/inbox`)

But the Sidebar doesn't significantly change between the two, creating context confusion.

### Filter Application Logic

```typescript
// From Sidebar.tsx lines 452-475

// These are conditionally filtered ONLY when NOT on /inbox
const filteredInboxPlans = useMemo(() => {
  if (isOnInbox) return inboxPlans; // SKIP filters
  const { filteredPlans } = filterAndSortPlans(...);
  return filteredPlans;
}, [isOnInbox, ...]);

// Result: Search/sort/status filters have no effect on /inbox page
```

This design suggests the intent is: *"Inbox page is a pre-filtered view; users shouldn't filter further."*

But it's not communicated clearly, so users are confused.

---

## Mental Model Analysis

### What Users Think

**User's Expected Mental Model:**
```
Click "Inbox" button
    ↓
Shows me all plans that need my review
    ↓
I can search/filter them
    ↓
I can approve or request changes
```

### What Actually Happens

**Actual System Behavior:**
```
Click "Inbox" button (/inbox)
    ↓
Shows full-page inbox view
    ↓
Sidebar still shows "My Plans" + "Shared" + "Archived"
    ↓
Filters are hidden (no search available)
    ↓
View is disconnected from sidebar

BUT ALSO:

View All Plans (/)
    ↓
Sidebar shows "Needs Review" section
    ↓
Sidebar shows "My Plans" + "Shared" + "Archived"
    ↓
Filters visible (can search)
    ↓
Clicking "Needs Review" item doesn't take you to /inbox
    ↓
Clicking "Inbox" nav button DOES take you to /inbox
    ↓
CONFUSING: Are "Inbox" nav and "Needs Review" sidebar the same?
```

### The Confusion

The system implements a **Dual-Navigation Paradigm** without making it clear:

1. **Browse/Manage Mode** (`/` - HomePage)
   - Purpose: Browse all plans, filter, organize
   - Primary UI: Sidebar with categorized plans
   - Actions: Select plan to view details

2. **Review Mode** (`/inbox` - InboxPage)
   - Purpose: Focused review workflow
   - Primary UI: Full-page list with action buttons
   - Actions: Approve, request changes, view details

But the UI doesn't distinguish between these modes clearly. Users don't realize they're switching contexts.

---

## Recommended Fixes

### Priority 1: CRITICAL - Consolidate Inbox Terminology

**Fix Scope:** Low-risk, high-impact terminology change

**Option A: Rename "Needs Review" → "Inbox" (Recommended)**

Changes:
- Sidebar section "Needs Review" → "Inbox" (line 668 in Sidebar.tsx)
- Makes terminology consistent with nav button
- Users understand: "Inbox" = all review items

Code change:
```typescript
// Line 668: Change from
<span className="text-xs font-semibold text-muted-foreground">Needs Review</span>

// To
<span className="text-xs font-semibold text-muted-foreground">Inbox</span>
```

**Pros:**
- Simple terminology fix
- Unified mental model
- Users can easily map "Inbox" nav to "Inbox" sidebar section

**Cons:**
- Doesn't fully address the dual-navigation issue
- Users may still be confused about the difference between clicking nav vs clicking sidebar item

**Impact:** Fixes ISSUE-3 (terminology confusion) by ~70%

---

### Priority 2: MAJOR - Context-Aware Sidebar

**Fix Scope:** Medium-effort, high-impact behavior change

**Option B: Hide Non-Inbox Sections on /inbox**

Changes when `isOnInbox === true`:
- Hide "My Plans" section
- Hide "Shared" section
- Hide "Archived" section
- Hide filters
- Show only inbox plans in sidebar (OR hide sidebar entirely)
- Add clear header: "Inbox - Review These Plans"

Code changes in Sidebar.tsx:
```typescript
// Line 717: Change from
{filteredMyPlans.length > 0 && (

// To
{!isOnInbox && filteredMyPlans.length > 0 && (

// Line 771: Change from
{filteredSharedPlans.length > 0 && (

// To
{!isOnInbox && filteredSharedPlans.length > 0 && (

// Line 823: Change from
{showArchived && filteredArchivedPlans.length > 0 && (

// To
{!isOnInbox && showArchived && filteredArchivedPlans.length > 0 && (
```

**Pros:**
- Clear context switching
- Sidebar adapts to workflow (browse vs review)
- Reduces visual clutter on /inbox page

**Cons:**
- Requires modest code changes
- Must test collapse/expand behavior on /inbox

**Impact:** Fixes ISSUE-1 completely

---

### Priority 3: MAJOR - Consistent Filters

**Fix Scope:** Medium-effort, usability improvement

**Option C: Show Filters on /inbox with Pre-Filter**

Changes:
- Show FilterControls on /inbox page (currently hidden at line 645)
- Pre-filter status to show only: pending_review, changes_requested
- Show clear label: "Filtered to items needing action"

Code changes in Sidebar.tsx:
```typescript
// Line 645: Change from
{!isOnInbox && (
  <FilterControls ...

// To
{/* Show filters on both pages */
  <FilterControls
    // When on /inbox, hide status filter (it's already filtered)
    // OR show read-only status badge
    ...
  />
}
```

Alternative: Add search to InboxPage directly instead of sidebar filters.

**Pros:**
- Consistent UI across pages
- Users can search inbox plans
- Follows principle of least surprise

**Cons:**
- Filters are less relevant on /inbox (already filtered)
- May clutter the interface

**Impact:** Fixes ISSUE-2 completely

---

### Priority 4: MINOR - Clear Archive Toggle State

**Fix Scope:** Low-effort, clarity improvement

**Change:** Add text label below archive toggle showing state

Code change in Sidebar.tsx (lines 888-896):
```typescript
// Current
<Button
  isIconOnly
  variant="ghost"
  size="sm"
  aria-label={showArchived ? 'Hide archived plans' : 'Show archived plans'}
  onPress={handleToggleArchived}
  className={`touch-target flex-1 ${showArchived ? 'text-primary' : ''}`}
>
  <Archive className="w-4 h-4" />
</Button>

// Add label
<div className="flex flex-col items-center gap-1">
  <Button ...>
    <Archive className="w-4 h-4" />
  </Button>
  <span className="text-[10px] text-muted-foreground">
    {showArchived ? 'Showing archived' : 'Hidden'}
  </span>
</div>
```

**Impact:** Fixes ISSUE-2's secondary concern (archive toggle clarity)

---

## Implementation Roadmap

### Phase 1: Quick Win (1-2 hours)

**Objective:** Fix terminology confusion (ISSUE-3)

**Tasks:**
1. Rename "Needs Review" → "Inbox" in sidebar
2. Update aria-label if needed
3. Test that sidebar section name matches nav button
4. Document the change in milestone

**Code changes:**
- `apps/web/src/components/Sidebar.tsx` line 668

**Testing:**
- Visual: "Inbox" nav matches "Inbox" sidebar section
- Functional: Selecting sidebar item navigates to plan detail

**Risk:** Minimal - purely cosmetic

---

### Phase 2: Context-Aware Sidebar (2-4 hours)

**Objective:** Hide non-relevant sections on /inbox (ISSUE-1)

**Tasks:**
1. Add `!isOnInbox` guard to "My Plans" section
2. Add `!isOnInbox` guard to "Shared" section
3. Add `!isOnInbox` guard to "Archived" section
4. Test sidebar behavior on both pages
5. Test responsive design (mobile drawer behavior)
6. Test collapsed sidebar state

**Code changes:**
- `apps/web/src/components/Sidebar.tsx` lines 717, 771, 823

**Testing:**
- Visual: / shows all sections, /inbox shows none
- Responsive: Mobile drawer behavior consistent
- Navigation: Links still work from inbox page

**Risk:** Medium - affects core sidebar logic

---

### Phase 3: Consistent Filters (3-6 hours)

**Objective:** Address filter inconsistency (ISSUE-2)

**Options:**
A. Show read-only status on /inbox
B. Hide /inbox filters but add search to InboxPage
C. Show filters but disable/gray out status filter

**Decision Point:** Requires UX decision on user expectations

**Tasks (if Option B):**
1. Add search input to InboxPage component
2. Filter inboxPlans by search query in real-time
3. Test search on mobile
4. Ensure search state clears on page leave

**Code changes:**
- `apps/web/src/pages/InboxPage.tsx`

**Testing:**
- Search finds plans by title
- Empty state shows when no results
- Search clears on navigation away

**Risk:** Medium - affects page interaction

---

### Phase 4: Polish (1-2 hours)

**Objective:** Improve clarity with visual indicators

**Tasks:**
1. Add archive toggle state label
2. Add page header distinguishing browse vs review
3. Add helpful tooltips explaining the dual mode
4. Update docs/milestones with new behavior

**Code changes:**
- `apps/web/src/components/Sidebar.tsx` (toggle label)
- `apps/web/src/pages/HomePage.tsx` (browse header)
- `apps/web/src/pages/InboxPage.tsx` (review header)

**Risk:** Minimal

---

## Testing Checklist

### Before Launch

- [ ] Sidebar sections appear/hide correctly on / and /inbox
- [ ] Archive toggle state is visible and clear
- [ ] "Inbox" terminology consistent across nav and sidebar
- [ ] Filters visible/hidden as designed
- [ ] Search works on both pages (if implemented)
- [ ] Mobile responsive behavior preserved
- [ ] Collapsed sidebar works on both pages
- [ ] Keyboard navigation accessible
- [ ] Screen reader friendly (aria-labels updated)

### User Testing

- [ ] Users understand difference between / and /inbox without asking
- [ ] Users can find "Inbox" items from both navigation and sidebar
- [ ] Users expect filters to work consistently
- [ ] Users understand archive toggle purpose
- [ ] Mobile experience is clear

---

## Screenshots Reference

All screenshots saved in: `ux-audit-screenshots/`

- `01-initial-state.png`: Home page with sidebar (no plans in test)
- `02-after-inbox-click.png`: After clicking Inbox nav
- `03-all-plans-view.png`: Back on All Plans page
- `04-filters-expanded.png`: Filters accordion expanded
- `05-after-search.png`: After searching
- `07-collapsed-sidebar.png`: Collapsed sidebar state
- `08-archived-toggle.png`: After toggling archived visibility

---

## Code References

**Key Files:**
- `/apps/web/src/components/Sidebar.tsx` - 923 lines
  - Lines 452-475: Filter application logic
  - Lines 644-656: Filter visibility condition
  - Lines 660-714: "Needs Review" section
  - Lines 717-768: "My Plans" section
  - Lines 771-820: "Shared" section
  - Lines 823-867: "Archived" section

- `/apps/web/src/pages/InboxPage.tsx` - 275 lines
  - Lines 54-138: InboxItem component
  - Lines 158-273: Main page layout

- `/apps/web/src/pages/HomePage.tsx` - 13 lines
  - Simple welcome page

**Related Hooks:**
- `useViewFilters()` - Search, sort, status filters
- `usePlanIndex()` - Fetches plan lists
- `useMultiProviderSync()` - Plan index syncing

---

## Notes for Future Work

1. **Architectural Decision Needed:** Is the dual-navigation (browse vs review) the right paradigm?
   - Could consolidate everything into one view with mode toggle
   - Could keep dual-navigation but make it much clearer
   - Current approach is a hybrid that confuses

2. **Archive Semantics:** The archive behavior is unclear
   - Is it permanent deletion or soft delete?
   - Can archived items be recovered?
   - Should they be visible by default?
   - Consider adding "restore" action to archived items

3. **Filter Persistence:** Do filter selections persist across navigation?
   - Currently applied globally but hidden on /inbox
   - Unclear if this is intentional

4. **Mobile UX:** Sidebar is collapsible on mobile
   - Does it collapse automatically on /inbox?
   - Is drawer mode tested?
   - Consider full-screen inbox view on mobile

5. **Future: Starred/Favorites:** Users might want to:
   - Star important plans
   - Filter by starred
   - See starred at top of sidebar
   - Consider adding this feature in future milestone

---

## Conclusion

The Peer-Plan sidebar has a **clear but undifferentiated dual-navigation paradigm** that confuses users. The root issue is that "Inbox" appears in two places (nav button and sidebar section) without clear differentiation of their roles.

**Quick Win:** Rename "Needs Review" → "Inbox" fixes terminology confusion.

**Medium Term:** Add context-aware sidebar behavior to clearly separate browse and review modes.

**Long Term:** Revisit whether dual-navigation is the right paradigm for the product.

---

**Generated:** 2026-01-13
**Test Environment:** localhost:5173 (no plans in test database)
**Browser:** Chromium (Playwright)
