# Milestone 10: Organizational Views

**Status**: In Progress
**Goal**: Multi-view interface for managing AI agent work at scale

---

## Overview

Transform Peer-Plan from a single-plan viewer into an "all-in-one agent manager" with multiple organizational views. This enables:

1. **Quick discovery** - Find plans instantly via search, sort, and filter
2. **Workflow visualization** - Kanban board for status management
3. **Proof-of-work gallery** - Visual artifact browsing with before/after comparisons
4. **Power user operations** - Table view for bulk actions and detailed analysis

**Strategic context**: The industry is converging on "artifacts as proof" (Google Antigravity, Nov 2025). We already have artifact support - this milestone surfaces that value through better organization.

---

## Design Rationale: Why We Pivoted Phase 1

**Original approach (abandoned):** Filters in sidebar header with global status chips.

**Research findings** from 9 tools (Notion, Linear, Asana, ClickUp, Monday.com, GitHub, Jira, Cursor, Antigravity):

### Finding 1: Inbox is Always a Destination, Not a Filter

Every tool we studied implements "Inbox" as a **separate route/page**, not a status filter applied to a list:

- **GitHub**: `/notifications` is a separate page, not a filter on Issues
- **Linear**: Inbox is a top-level menu item with its own URL
- **Notion**: Inbox lives in sidebar as a distinct destination
- **Asana**: My Tasks/Inbox is a separate workspace view

**Why this matters:** When users click "Inbox", they expect to land in a dedicated space optimized for triage. Applying a filter to an existing list creates confusion:
- "Is this filtering my current view or showing me something new?"
- "If I'm in a plan detail view, does the filter apply?"
- "How do I get back to seeing everything?"

### Finding 2: Filters in Header Waste Vertical Space

The original design placed status filter chips + sort dropdown + search in the sidebar header:

```
[Original Design - Wastes Space]
┌──────────────────────────┐
│ Peer Plan            [+] │
├──────────────────────────┤
│ [Search..................]│
│ [Sort: Newest ▼]          │
│ [Draft][Review][Done]...  │  ← Always visible, takes 3 rows
├──────────────────────────┤
│ Plan 1                    │
│ Plan 2                    │  ← Less room for actual plans
│ Plan 3                    │
└──────────────────────────┘
```

**Problem:** On a 768px laptop, this steals ~100px of vertical space that should show plans.

**Solution:** Filters belong on the `/plans` page (main content area), not sidebar. Inbox is a separate route that doesn't need filters.

### Finding 3: Global Filters Create Scope Confusion

Original design applied filters "globally" across the sidebar list:

- User filters to "Pending Review" status
- Navigates to Inbox... but filter still applies?
- Inbox now shows only pending plans? Or is Inbox different?

**Industry pattern:** Filters are **view-scoped**, not app-scoped:
- GitHub: Issue filters don't affect your notification list
- Linear: Board filters don't affect Inbox
- Notion: Database filters are per-database

### New Design Direction

Based on these findings, Phase 1 now implements:

1. **Inbox as separate route** (`/inbox`) - "What needs my attention NOW"
2. **Filters on /plans route only** - Where users expect to browse/search
3. **Collapsible filter section** - Accordion to minimize when not needed

---

## User Stories

**Reviewer**: "I want to see all plans waiting for my review in one place, with quick approve/reject actions."

**Plan Owner**: "I want to see the status of all my active plans at a glance and move them through the workflow."

**Team Lead**: "I want to filter plans by tag/project and see which agents have work pending."

**Power User**: "I want to sort, filter, and bulk-operate on many plans efficiently."

---

## Architecture

### View Data Flow

```
usePlanIndex()
      |
      v
getPlanIndex(ydoc) --> Raw plan list from CRDT
      |
      v
useViewFilters(plans, filters) --> Apply search, sort, status/tag filters
      |
      v
useViewGrouping(filteredPlans, groupBy) --> Group by status, repo, tags, etc.
      |
      v
ViewComponent --> Render as Queue, Kanban, Gallery, or Table
```

### State Shape

```typescript
interface ViewState {
  // Current view
  activeView: 'inbox' | 'kanban' | 'gallery' | 'table';

  // Common filters (apply to all views)
  search?: string;
  statusFilter?: PlanStatusType[];
  tagFilter?: string[];
  repoFilter?: string;

  // View-specific settings
  kanban?: {
    swimlaneBy?: 'agent' | 'repo' | 'owner';
  };

  table?: {
    visibleColumns: string[];
    sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>;
  };

  gallery?: {
    groupBy: 'plan' | 'type' | 'date';
    thumbnailSize: 'small' | 'medium' | 'large';
  };
}
```

**Storage**: localStorage for preferences, URL params for shareability (view, filters)

---

## Phase 1: Navigation & Filtering Foundation

**Goal**: Route-based navigation with Inbox as destination, filters on /plans view

**Effort**: 3-4 days

### Phase 1a: Sidebar Navigation

**Goal:** Add route-based navigation to sidebar

- [ ] Add navigation section at top of sidebar with:
  - **Inbox** - `/inbox` route (plans needing your attention)
  - **Active** - `/plans?status=active` (in_progress + pending_review)
  - **All Plans** - `/plans` route (browsable list with filters)
- [ ] Highlight active route in sidebar
- [ ] Show count badges (e.g., "Inbox (3)")
- [ ] Keep plan list below navigation (scrollable)

**Design:**
```
┌──────────────────────────┐
│ Peer Plan            [+] │
├──────────────────────────┤
│ 📥 Inbox            (3)  │  ← Routes
│ ⚡ Active           (5)  │
│ 📋 All Plans             │
├──────────────────────────┤
│ Recent Plans             │  ← Quick access list
│ ├─ Auth implementation   │
│ ├─ API refactor          │
│ └─ Bug fix #123          │
└──────────────────────────┘
```

**Files:**
```
apps/web/src/components/Sidebar.tsx        -- Add navigation section
apps/web/src/components/SidebarNav.tsx     -- New: Navigation component
apps/web/src/App.tsx                       -- Add /inbox, /plans routes
```

### Phase 1b: Collapsible Filter Section on /plans

**Goal:** Filters only appear on /plans view, wrapped in Accordion

- [ ] Create `/plans` page with filter controls
- [ ] Wrap filters in HeroUI `Accordion` (collapsed by default)
- [ ] Filter controls include:
  - Search input (fuzzy match by title)
  - Sort dropdown (Name, Newest, Recently Updated, Status)
  - Status filter chips (multi-select)
- [ ] Persist filter state in URL params for shareability
- [ ] Persist Accordion open/closed state in localStorage

**Design:**
```
┌─────────────────────────────────────────────┐
│ All Plans                           [+ New] │
├─────────────────────────────────────────────┤
│ ▶ Filters                                   │  ← Collapsed by default
├─────────────────────────────────────────────┤
│ [Plan Card 1]                               │
│ [Plan Card 2]                               │
│ [Plan Card 3]                               │
└─────────────────────────────────────────────┘

[Expanded state]
├─────────────────────────────────────────────┤
│ ▼ Filters                                   │
│   [Search..................] [Sort: Newest ▼]│
│   Status: [Draft] [Review] [Approved] [Done]│
├─────────────────────────────────────────────┤
```

**Files:**
```
apps/web/src/pages/PlansPage.tsx           -- New: /plans route
apps/web/src/components/PlanFilters.tsx    -- New: Accordion filter section
apps/web/src/hooks/usePlanFilters.ts       -- New: Filter state & URL sync
apps/web/src/utils/uiPreferences.ts        -- Add filter preferences
```

### Phase 1c: Inbox Page Implementation

**Goal:** Dedicated inbox optimized for triage workflow

- [ ] Create `/inbox` page showing plans that need your attention:
  - Plans with status `pending_review` where you're a reviewer
  - Plans with status `changes_requested` that you own
  - Plans awaiting your approval (from Milestone 8)
- [ ] Group by urgency/action type:
  - "Needs Your Review" section
  - "Needs Your Action" section (your plans with feedback)
  - "Recently Completed" section (collapsed)
- [ ] Quick actions on each item:
  - [Approve] [Request Changes] buttons inline
  - Click to open plan detail
- [ ] Show artifact completion status (e.g., "4/5 artifacts")
- [ ] Show time since last update ("2h ago")

**Design:**
```
┌─────────────────────────────────────────────┐
│ Inbox                                       │
├─────────────────────────────────────────────┤
│ Needs Your Review (3)                       │
│ ┌─────────────────────────────────────────┐ │
│ │ Auth implementation          ⏱ 2h ago  │ │
│ │ Agent: Claude | Artifacts: 4/5         │ │
│ │                    [Approve] [Changes] │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ API refactor                 ⏱ 1h ago  │ │
│ │ Agent: GPT-4  | Artifacts: 2/3         │ │
│ │                    [Approve] [Changes] │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Needs Your Action (1)                       │
│ ┌─────────────────────────────────────────┐ │
│ │ Bug fix #123        ⚠️ Changes requested │ │
│ │ Feedback from @jacob | 3 comments      │ │
│ │                              [View]    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ▶ Recently Completed (5)                    │
└─────────────────────────────────────────────┘
```

**Files:**
```
apps/web/src/pages/InboxPage.tsx           -- New: /inbox route
apps/web/src/components/InboxCard.tsx      -- New: Inbox item card
apps/web/src/hooks/useInboxPlans.ts        -- New: Filter for inbox items
```

### Technical Notes

- Use HeroUI `Accordion` for collapsible filters
- Use HeroUI `TextField` for search, `Select` for sort, `Chip` for status filters
- Filtering happens client-side (plan list is small, <1000 items)
- Fuzzy matching: Use simple `includes()` for now, consider `fuse.js` later if needed
- URL params: `?search=auth&status=draft,pending_review&sort=newest`

### Success Criteria

1. User lands on `/inbox` by default and sees plans needing attention
2. Clicking "All Plans" navigates to `/plans` with filter controls
3. Filters are collapsed by default, saving vertical space
4. Opening filters and searching works with <50ms response time
5. Filter state persists in URL (shareable links)
6. Accordion state persists across page refreshes
7. Inbox quick actions (Approve/Changes) work without navigating away

### Demo Checkpoint

```
1. User opens Peer-Plan -> lands on /inbox
2. Sees 3 plans needing review with quick action buttons
3. Clicks "Approve" on one -> plan moves to approved
4. Clicks "All Plans" in sidebar -> navigates to /plans
5. Expands Filters accordion -> types "auth" in search
6. Sees filtered results, URL updates to ?search=auth
7. Shares URL with teammate -> they see same filtered view
8. Collapses filters -> refreshes page -> stays collapsed
```

---

## Phase 2: View Switcher & Kanban Board

**Goal**: Add view switching and Kanban visualization with drag-drop status changes

**Effort**: 4-5 days

### Deliverables

- [ ] **2a: View switcher component**
  - Tab-style switcher in main content header
  - Icons: Inbox, Kanban, Gallery, Table
  - Active view highlighted
  - Keyboard accessible (arrow keys)

- [ ] **2b: Main layout refactor**
  - Move from plan-only content to view-aware layout
  - Route: `/views/:viewType` or use query param `?view=kanban`
  - Preserve `/plan/:id` route for direct plan access

- [ ] **2c: Kanban board component**
  - 6 columns matching `PlanStatusValues`: draft, pending_review, approved, changes_requested, in_progress, completed
  - Cards show: title, artifact count badge, owner avatar, time since update
  - Column headers show count
  - Empty columns show placeholder

- [ ] **2d: Drag-drop status changes**
  - Install `@dnd-kit/core` and `@dnd-kit/sortable`
  - Drag card between columns -> update status in CRDT
  - Optimistic UI update
  - Conflict resolution: last-write-wins (CRDT handles)

- [ ] **2e: Kanban card actions**
  - Click card -> navigate to plan
  - Hover shows quick actions: Archive, View
  - Right-click context menu (stretch goal)

### Dependencies

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities --filter @peer-plan/web
```

### Files to Create/Modify

```
apps/web/src/components/views/              -- New directory
apps/web/src/components/views/KanbanView.tsx    -- New: Kanban board
apps/web/src/components/views/KanbanColumn.tsx  -- New: Single column
apps/web/src/components/views/KanbanCard.tsx    -- New: Plan card
apps/web/src/components/ViewSwitcher.tsx        -- New: Tab switcher
apps/web/src/components/ViewLayout.tsx          -- New: Main layout wrapper
apps/web/src/hooks/useViewState.ts              -- New: View state management
apps/web/src/pages/ViewsPage.tsx                -- New: Views route handler
apps/web/src/App.tsx                            -- Add views route
```

### Technical Notes

**@dnd-kit architecture**:
```typescript
<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={columnItems}>
    {columns.map(col => (
      <KanbanColumn key={col.status} status={col.status}>
        {col.plans.map(plan => (
          <SortableItem key={plan.id} id={plan.id}>
            <KanbanCard plan={plan} />
          </SortableItem>
        ))}
      </KanbanColumn>
    ))}
  </SortableContext>
</DndContext>
```

**Status update on drag**:
```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;

  const planId = active.id as string;
  const newStatus = over.data.current?.status as PlanStatusType;

  // Update in CRDT (syncs automatically)
  setPlanStatus(indexDoc, planId, newStatus);
}
```

### Success Criteria

1. User can switch between Inbox and Kanban views
2. All plans appear in correct status columns
3. Dragging a card to a new column updates its status
4. Status change syncs to other connected peers in <1s
5. Mobile: Cards are tappable, drag works on touch devices

### Demo Checkpoint

```
1. User opens Peer-Plan, sees Inbox view by default
2. Clicks Kanban icon in view switcher
3. Sees 6 columns with plans distributed by status
4. Drags a "draft" plan to "pending_review" column
5. Status updates, card moves smoothly
6. Opens plan from card -> sees updated status in header
```

---

## Phase 3: Tags & Filtering Infrastructure

**Goal**: Add user-defined tags for flexible organization

**Effort**: 3-4 days

### Deliverables

- [ ] **3a: Schema updates**
  - Add `tags?: string[]` to `PlanMetadata`
  - Add `tags?: string[]` to `PlanIndexEntry` (denormalized for sidebar)
  - Add `project?: string` field (optional grouping)
  - Update Zod schemas

- [ ] **3b: Tag editor component**
  - Inline tag chips in plan header
  - Click to add/remove tags
  - Autocomplete from existing tags (global)
  - Max 10 tags per plan

- [ ] **3c: Tag management helpers**
  ```typescript
  // In packages/schema/src/yjs-helpers.ts
  addTag(ydoc: Y.Doc, tag: string): void
  removeTag(ydoc: Y.Doc, tag: string): void
  getTags(ydoc: Y.Doc): string[]
  getAllTagsFromIndex(indexDoc: Y.Doc): string[]
  ```

- [ ] **3d: Tag filter in sidebar/views**
  - Dropdown/popover with all available tags
  - Multi-select (AND or OR logic, default OR)
  - Show tag count badge

- [ ] **3e: MCP tool updates**
  - `create_plan` accepts optional `tags: string[]`
  - `update_plan` can add/remove tags
  - `read_plan` returns tags in response

### Files to Modify

```
packages/schema/src/plan.ts                 -- Add tags field
packages/schema/src/plan-index.ts           -- Add tags field
packages/schema/src/yjs-helpers.ts          -- Add tag helpers
apps/web/src/components/TagEditor.tsx       -- New: Tag editing UI
apps/web/src/components/TagFilter.tsx       -- New: Tag filter dropdown
apps/web/src/components/PlanHeader.tsx      -- Add TagEditor
apps/server/src/tools/create-plan.ts        -- Accept tags param
apps/server/src/tools/update-plan.ts        -- Add tag operations
```

### Technical Notes

**Tag storage in Y.Doc**:
```typescript
// In metadata Y.Map
metadata.set('tags', ['frontend', 'auth', 'urgent']);

// Tag sync: When plan tags change, update index entry too
ydoc.on('update', () => {
  const tags = metadata.get('tags') as string[];
  setPlanIndexEntry(indexDoc, { ...entry, tags });
});
```

**Global tag collection** (for autocomplete):
```typescript
function getAllTagsFromIndex(indexDoc: Y.Doc): string[] {
  const plans = getPlanIndex(indexDoc, true);
  const tagSet = new Set<string>();
  plans.forEach(p => p.tags?.forEach(t => tagSet.add(t)));
  return Array.from(tagSet).sort();
}
```

### Success Criteria

1. User can add up to 10 tags to any plan
2. Tags appear in plan header and sidebar
3. Tag autocomplete shows existing tags
4. Filtering by tag shows only matching plans
5. MCP tools can set tags on plan creation

### Demo Checkpoint

```
1. User opens a plan
2. Clicks "+ Add tag" in header
3. Types "frontend", presses Enter
4. Tag appears as chip
5. Opens sidebar, enables tag filter
6. Selects "frontend" -> only that plan shows
7. Agent creates new plan with tags via MCP
8. Plan appears with tags already set
```

---

## Phase 4: Artifact Gallery View

**Goal**: Visual proof-of-work gallery with before/after comparisons

**Effort**: 5-7 days

### Deliverables

- [ ] **4a: Gallery view component**
  - Masonry grid layout for varied aspect ratios
  - Virtualized for performance (100+ artifacts)
  - Responsive columns (1-4 based on viewport)

- [ ] **4b: Artifact thumbnail cards**
  - Lazy-load images
  - Type icon overlay (video, test results, diff)
  - Plan title + status badge
  - Click to expand fullscreen

- [ ] **4c: Gallery filters**
  - Artifact type: All, Screenshots, Videos, Test Results, Diffs
  - Plan filter: All, Specific plan
  - Date range: Last 7 days, Last 30 days, All time

- [ ] **4d: Before/After comparison mode**
  - Select two artifacts to compare
  - Side-by-side or slider overlay
  - Works with screenshots only (not video)

- [ ] **4e: Fullscreen lightbox**
  - Click artifact to enlarge
  - Arrow keys for navigation
  - Download button
  - Close on Escape

### Dependencies

```bash
pnpm add masonic react-compare-image --filter @peer-plan/web
```

### Files to Create

```
apps/web/src/components/views/GalleryView.tsx       -- New: Gallery container
apps/web/src/components/views/ArtifactCard.tsx      -- New: Thumbnail card
apps/web/src/components/views/GalleryFilters.tsx    -- New: Filter controls
apps/web/src/components/ComparisonViewer.tsx        -- New: Before/after slider
apps/web/src/components/Lightbox.tsx                -- New: Fullscreen modal
apps/web/src/hooks/useAllArtifacts.ts               -- New: Aggregate artifacts
```

### Technical Notes

**Masonic usage**:
```typescript
import { Masonry } from 'masonic';

<Masonry
  items={artifacts}
  render={ArtifactCard}
  columnGutter={16}
  columnWidth={250}
  overscanBy={5}
/>
```

**Aggregate artifacts from all plans**:
```typescript
function useAllArtifacts(plans: PlanIndexEntry[]) {
  // For each plan, load its Y.Doc and extract artifacts
  // Memoize heavily - this could be expensive
  // Consider: artifact index in plan-index doc for performance
}
```

**Before/After comparison**:
```typescript
import ReactCompareImage from 'react-compare-image';

<ReactCompareImage
  leftImage={beforeUrl}
  rightImage={afterUrl}
  sliderPositionPercentage={0.5}
/>
```

### Success Criteria

1. All artifacts across plans appear in masonry grid
2. Gallery loads smoothly with 100+ artifacts (virtualization working)
3. Filters reduce visible artifacts correctly
4. Clicking artifact opens fullscreen lightbox
5. Two screenshots can be compared side-by-side

### Demo Checkpoint

```
1. User creates 3 plans with multiple artifacts each
2. Opens Gallery view
3. Sees masonry grid of all artifacts
4. Filters to "Screenshots only" -> videos disappear
5. Clicks a screenshot -> fullscreen opens
6. Selects two artifacts -> comparison mode activates
7. Slides between before/after views
```

---

## Phase 5: Table View

**Goal**: Power user interface for bulk operations

**Effort**: 4-5 days

### Deliverables

- [ ] **5a: Table view component**
  - TanStack Table integration
  - Columns: Title, Status, Owner, Tags, Artifacts, PR, Created, Updated
  - Sortable columns (click header)
  - Resizable columns

- [ ] **5b: Column configuration**
  - Show/hide columns via dropdown
  - Drag to reorder columns
  - Persist configuration

- [ ] **5c: Row selection & bulk actions**
  - Checkbox column for multi-select
  - Select all / none
  - Bulk actions: Archive, Change Status, Add Tag

- [ ] **5d: Inline editing** (stretch)
  - Double-click cell to edit
  - Save on blur or Enter
  - Cancel on Escape

### Dependencies

```bash
pnpm add @tanstack/react-table --filter @peer-plan/web
```

### Files to Create

```
apps/web/src/components/views/TableView.tsx         -- New: Table container
apps/web/src/components/views/TableColumns.tsx      -- New: Column definitions
apps/web/src/components/views/BulkActionBar.tsx     -- New: Action toolbar
apps/web/src/hooks/useTableConfig.ts                -- New: Column preferences
```

### Technical Notes

**TanStack Table setup**:
```typescript
const columns = useMemo(() => [
  { accessorKey: 'title', header: 'Title', cell: TitleCell },
  { accessorKey: 'status', header: 'Status', cell: StatusCell },
  { accessorKey: 'tags', header: 'Tags', cell: TagsCell },
  // ...
], []);

const table = useReactTable({
  data: plans,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
});
```

**Bulk status change**:
```typescript
async function bulkUpdateStatus(planIds: string[], newStatus: PlanStatusType) {
  for (const id of planIds) {
    // Update in plan-index CRDT
    const entry = getPlanIndexEntry(indexDoc, id);
    if (entry) {
      setPlanIndexEntry(indexDoc, { ...entry, status: newStatus });
    }
    // Also update the plan's own metadata
    // (requires loading each plan doc - batch for performance)
  }
}
```

### Success Criteria

1. Table displays all plans with sortable columns
2. User can show/hide columns
3. Multi-select + bulk archive works
4. Column order persists across sessions
5. Table handles 500+ plans without lag (virtualization)

### Demo Checkpoint

```
1. User opens Table view
2. Sees all plans in rows with all columns
3. Clicks "Status" header -> sorts by status
4. Hides "Created" column via dropdown
5. Selects 5 plans with checkboxes
6. Clicks "Archive Selected" -> all 5 archived
7. Refreshes -> column preferences preserved
```

---

## Future Phases (Not in Milestone 10)

### Timeline View

**Goal**: Temporal visualization for retrospectives and audit trails

- Vertical timeline showing plan events
- Events: Created, Status changed, Artifact uploaded, Reviewed, Completed
- Filterable by date range
- Export for compliance

**Effort**: 5-7 days

**Why deferred**: Low priority, "nice-to-have" per research. Revisit after core views validated.

### Saved Views

**Goal**: Named view configurations users can save and share

- Save current filters/sort as named view
- Quick switch between saved views
- Share view configuration via URL

**Effort**: 3-4 days

**Why deferred**: Start with personal preferences (Phase 1), add saved views based on feedback.

### Dashboard / Analytics

**Goal**: Aggregate metrics and trends

- Plans created per week
- Approval rate over time
- Average time to review
- Agent performance comparison

**Effort**: 5-7 days

**Why deferred**: Need usage data first. Build after organizational views are in use.

---

## Component Hierarchy

```
App
├── Sidebar
│   ├── SidebarNav (Inbox, Active, All Plans routes)
│   └── RecentPlansList (quick access to recent plans)
│
├── /inbox route
│   └── InboxPage
│       ├── InboxSection ("Needs Your Review")
│       │   └── InboxCard[] (with quick actions)
│       ├── InboxSection ("Needs Your Action")
│       │   └── InboxCard[]
│       └── CollapsibleSection ("Recently Completed")
│           └── InboxCard[]
│
├── /plans route
│   └── PlansPage
│       ├── PlanFilters (Accordion)
│       │   ├── SearchInput
│       │   ├── SortDropdown
│       │   └── StatusChips
│       └── PlanList (cards or view content)
│
├── /kanban route (Phase 2)
│   └── KanbanView
│       └── KanbanColumn[]
│           └── KanbanCard[]
│
├── /gallery route (Phase 4)
│   └── GalleryView
│       ├── GalleryFilters
│       └── Masonry
│           └── ArtifactCard[]
│
└── /table route (Phase 5)
    └── TableView
        ├── TableHeader (sortable, resizable)
        ├── TableBody (virtualized rows)
        └── BulkActionBar
```

---

## Testing Strategy

Following engineering-standards.md:

### 3+ Rule Tests (High Priority)

These utilities will be used across all views:

- `useViewFilters` - filter/sort logic
- `useViewGrouping` - group-by logic
- `getAllTagsFromIndex` - tag aggregation
- `useAllArtifacts` - artifact collection

### Integration Tests

- View switching preserves filter state
- Drag-drop updates status correctly
- Bulk actions apply to all selected
- View preferences persist and restore

### Manual Testing Checklist

- [ ] Search filters as you type
- [ ] Drag-drop works on mobile (touch)
- [ ] Gallery loads 100+ artifacts smoothly
- [ ] Table sorts correctly for all column types
- [ ] Filters combine correctly (search + status + tags)

---

## Dependencies

- **Milestone 7 (Artifacts)** - Gallery view needs artifact infrastructure
- **Milestone 9 (GitHub Identity)** - Owner filtering needs username

## Blocks

- Nothing (additive feature, existing UI continues working)

---

## Risk Mitigation

### Risk 1: Performance with Many Plans

**Concern**: Views slow with 500+ plans

**Mitigation**:
- Virtualize all list-based views from day one (Masonic, TanStack)
- Test with synthetic data (create 500 test plans)
- Add pagination if needed (but defer unless actually slow)

### Risk 2: Mobile Complexity

**Concern**: Kanban drag-drop awkward on mobile

**Mitigation**:
- Start desktop-first
- On mobile: use tap-to-move instead of drag
- Gallery and Inbox work well on mobile out of the box

### Risk 3: Over-Engineering

**Concern**: Building features users don't need

**Mitigation**:
- Ship Phase 1 (sidebar) first, get feedback
- Phase 2-5 can be reordered based on user requests
- Each phase is independently valuable

### Risk 4: CRDT Conflicts

**Concern**: Simultaneous status changes conflict

**Mitigation**:
- Last-write-wins is fine for status changes
- Yjs handles merge automatically
- No special conflict resolution needed

---

## Estimated Effort

| Phase | Effort | Cumulative |
|-------|--------|------------|
| Phase 1a: Sidebar Navigation | 1-2 days | 1-2 days |
| Phase 1b: Collapsible Filters | 1-2 days | 2-4 days |
| Phase 1c: Inbox Page | 1-2 days | 3-6 days |
| Phase 2: View Switcher & Kanban | 4-5 days | 7-11 days |
| Phase 3: Tags & Filtering | 3-4 days | 10-15 days |
| Phase 4: Artifact Gallery | 5-7 days | 15-22 days |
| Phase 5: Table View | 4-5 days | 19-27 days |

**Total: ~4-6 weeks of focused work**

**Recommended approach**: Ship Phase 1a-1c incrementally, validating each sub-phase. The route-based architecture makes each piece independently deployable.

---

## Success Metrics

### UX Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time to find a plan | <5 seconds | User testing |
| Time to approve plan from Inbox | <30 seconds | Task timing |
| Time to triage Inbox | <2 min for 5 items | User testing |
| Filter interaction latency | <50ms | Performance trace |
| Route navigation latency | <100ms | Performance trace |

### Product Metrics

| Metric | Target | Why |
|--------|--------|-----|
| Plans created per week | Growing | Adoption |
| Inbox usage rate | >80% of sessions | Validates route-based design |
| Filter usage rate | >30% of /plans visits | Validates collapsible filters |
| Tag usage rate | >50% of plans | Organization value (Phase 3) |
| Gallery visits | >20% of sessions | Artifact value (Phase 4) |

---

## Appendix: Library Comparison

### Drag-and-Drop

| Library | Bundle Size | Touch | Accessibility | Verdict |
|---------|-------------|-------|---------------|---------|
| @dnd-kit | ~10KB | Yes | Excellent | **Selected** |
| react-beautiful-dnd | ~30KB | Yes | Good | Deprecated |
| react-dnd | ~20KB | Via addon | Limited | Too complex |

### Table

| Library | Bundle Size | Virtual | Headless | Verdict |
|---------|-------------|---------|----------|---------|
| TanStack Table | ~15KB | Yes | Yes | **Selected** |
| AG Grid | ~100KB+ | Yes | No | Overkill |
| react-table v7 | ~10KB | Manual | Yes | Superseded by TanStack |

### Masonry

| Library | Bundle Size | Virtual | SSR | Verdict |
|---------|-------------|---------|-----|---------|
| Masonic | ~8KB | Yes | Yes | **Selected** |
| react-masonry-css | ~3KB | No | Yes | No virtualization |
| react-photo-gallery | ~15KB | Limited | Yes | Photo-specific |

---

*Created: 2026-01-12*
