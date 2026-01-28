# Side-Gutter Comment System Implementation Plan

## Executive Summary

This plan outlines a custom side-gutter comment system to replace BlockNote's broken inline comments. The goal is a Notion/Google Docs-style experience where comments appear alongside the editor at the vertical position of their associated text.

## Existing Ticket

**Issue #29**: [Feature: Notion-style anchored comments alongside editor](https://github.com/SchoolAI/shipyard/issues/29)

Labels: `enhancement`, `P3`, `ui`, `ux`

Related issues:
- **Issue #54**: [Add voice input to BlockNote comment composer](https://github.com/SchoolAI/shipyard/issues/54) - complementary feature

## Problem Statement

BlockNote's inline comment system has critical bugs causing content corruption. The current implementation uses:
- `FloatingThreadController` - Shows comments as popups when clicking highlighted text
- `FloatingComposerController` - Handles new comment creation
- `YjsThreadStore` - Stores threads in Yjs `YDOC_KEYS.THREADS` map

The corruption issues stem from BlockNote's internal handling of comment marks in the ProseMirror document.

## Recommended Approach

**Build a custom external sidebar comment system** rather than fixing BlockNote internals.

### Why Custom Over Fixing BlockNote

| Factor | Custom System | Fix BlockNote |
|--------|--------------|---------------|
| Control | Full control over behavior | Limited to BlockNote's architecture |
| Stability | Our code, our bugs | Dependent on upstream fixes |
| Maintenance | Own the codebase | Wait for releases, hope for fixes |
| Mobile | Can design mobile-first | Constrained by their UI decisions |
| Effort | ~40-60 hours | Unknown (could be weeks hunting bugs) |
| Risk | Medium (known scope) | High (unknown BlockNote internals) |

**Recommendation**: Build custom. We already have the Thread data model working; we just need better UI.

---

## Research Findings

### Existing Libraries Evaluated

1. **Liveblocks AnchoredThreads**
   - Best implementation, but requires Liveblocks sync infrastructure
   - We use Yjs, so this is incompatible
   - Reference: [Liveblocks API](https://liveblocks.io/docs/api-reference/liveblocks-react-blocknote)

2. **Tiptap Comments Extension**
   - Paid feature in beta
   - Also uses their sync layer
   - Incompatible with our Yjs setup

3. **Velt**
   - Commercial alternative to Liveblocks
   - Same sync infrastructure lock-in problem

**Conclusion**: No drop-in open-source solution exists. Custom implementation required.

### ProseMirror Position Tracking

Key techniques from [ProseMirror discussions](https://discuss.prosemirror.net/t/vertically-align-sidebar-blocks-to-content/4775):

1. **External sidebar approach** (recommended):
   - Keep comments outside contentEditable
   - Calculate positions manually
   - Avoids selection/clipboard interference

2. **Position APIs**:
   - `view.coordsAtPos(pos)` - Get screen coordinates from document position
   - `view.domAtPos(pos)` - Get DOM node at position
   - `element.getBoundingClientRect()` - Get element screen position

3. **Update triggers**:
   - Content changes (editor transactions)
   - Window resize
   - Scroll events (debounced)

---

## Data Model

### Existing Thread Schema (Reuse)

```typescript
// packages/schema/src/thread.ts
interface Thread {
  id: string;
  comments: ThreadComment[];
  resolved?: boolean;
  selectedText?: string;  // Text content when thread was created
}

interface ThreadComment {
  id: string;
  userId: string;
  body: CommentBody;  // string | block content
  createdAt: number;
}
```

### New: Thread Position Tracking

We need to track which **block** a thread is anchored to (not character positions, which are fragile).

```typescript
// Option 1: Extend Thread schema (preferred)
interface Thread {
  // ... existing fields
  anchorBlockId?: string;  // BlockNote block ID
  anchorType: 'text-selection' | 'block';  // How it was created
}

// Option 2: Separate position map (for performance)
// Y.Map<threadId, { blockId: string; offsetY: number }>
```

**Recommendation**: Option 1 - simpler, threads already synced via Yjs.

### Block ID System (Already Exists)

We already embed block IDs in exported markdown:
```markdown
<!-- block:0ec317de-e0e8-4e21-a4a4-7263be0b9154 -->
# Plan Title

<!-- block:a1b2c3d4-... -->
- Step 1
```

This is handled in `apps/server/src/export-markdown.ts`.

---

## Architecture

### Component Structure

```
apps/web/src/
├── components/
│   ├── comments/
│   │   ├── CommentGutter.tsx        # Main sidebar container
│   │   ├── AnchoredThread.tsx       # Single thread card
│   │   ├── ThreadComposer.tsx       # New comment input
│   │   ├── CommentCard.tsx          # Individual comment
│   │   └── MobileCommentSheet.tsx   # Mobile bottom sheet
│   └── PlanViewer.tsx               # Updated to include gutter
├── hooks/
│   ├── useThreadPositions.ts        # Calculate thread Y coords
│   ├── useAnchoredThreads.ts        # Filter/sort threads by block
│   └── useCommentSheet.ts           # Mobile sheet state
```

### Position Tracking Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     PlanViewer                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │     BlockNoteView        │  │    CommentGutter         │ │
│  │                          │  │                          │ │
│  │  ┌────────────────────┐  │  │  ┌────────────────────┐  │ │
│  │  │ Block A            │  │  │  │ Thread for A       │  │ │
│  │  │ [id: abc123]       │──┼──┼─▶│ y: 100px           │  │ │
│  │  └────────────────────┘  │  │  └────────────────────┘  │ │
│  │                          │  │                          │ │
│  │  ┌────────────────────┐  │  │  ┌────────────────────┐  │ │
│  │  │ Block B            │  │  │  │ Thread for B       │  │ │
│  │  │ [id: def456]       │──┼──┼─▶│ y: 250px           │  │ │
│  │  │ (highlight mark)   │  │  │  │                    │  │ │
│  │  └────────────────────┘  │  │  └────────────────────┘  │ │
│  │                          │  │                          │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Thread-to-Block Association

BlockNote's comment marks are stored on text ranges, but we can derive the block ID:

```typescript
// In useAnchoredThreads.ts
function getThreadBlockId(editor: BlockNoteEditor, threadId: string): string | null {
  // 1. Find the mark with this thread ID in the ProseMirror doc
  // 2. Get the position of that mark
  // 3. Get the block containing that position
  // 4. Return block.id
}
```

---

## Implementation Steps

### Phase 1: Core Infrastructure (8-12 hours)

1. **Create position tracking hook** (`useThreadPositions.ts`)
   - Subscribe to editor changes
   - Map thread IDs to Y coordinates
   - Debounce recalculation on scroll

2. **Create thread association hook** (`useAnchoredThreads.ts`)
   - Get threads from Yjs
   - Associate each with a block ID
   - Handle orphaned threads (block deleted)

3. **Build basic gutter component** (`CommentGutter.tsx`)
   - Render alongside editor
   - Position threads using CSS transforms
   - Handle thread stacking when overlapping

### Phase 2: Thread Cards (8-12 hours)

4. **Build thread card component** (`AnchoredThread.tsx`)
   - Display comments
   - Resolve/unresolve toggle
   - Delete functionality
   - Reply input

5. **Build comment display** (`CommentCard.tsx`)
   - User avatar/name
   - Timestamp
   - Comment body rendering (supports structured content)

6. **Build composer** (`ThreadComposer.tsx`)
   - Text input with placeholder
   - Submit button
   - Enter/Shift+Enter behavior

### Phase 3: Interactions (6-8 hours)

7. **Click-to-scroll behavior**
   - Click thread → scroll editor to highlighted text
   - Highlight the text briefly

8. **Text selection → comment creation**
   - Detect text selection in editor
   - Show "Add comment" affordance
   - Open composer positioned at selection

9. **Thread stacking**
   - When multiple threads at same Y position
   - Stack vertically with gap
   - Animate expansion/collapse

### Phase 4: Mobile Support (8-12 hours)

10. **Bottom sheet implementation** (`MobileCommentSheet.tsx`)
    - Use `react-modal-sheet` or similar
    - List all threads sorted by position
    - Tap thread → scroll to and highlight text

11. **Responsive layout**
    - Desktop: side gutter (>768px)
    - Mobile: comment count badges on blocks
    - Tap badge → open sheet filtered to that block

12. **Touch interactions**
    - Long-press text → show "Comment" option
    - Swipe thread to resolve/delete

### Phase 5: Polish & Edge Cases (6-10 hours)

13. **Animation & transitions**
    - Thread position changes
    - Expand/collapse replies
    - Resolve fade-out

14. **Keyboard accessibility**
    - Tab navigation through threads
    - Enter to expand/reply
    - Escape to close

15. **Edge cases**
    - Empty state (no comments)
    - Very long threads
    - Many threads on one block
    - Thread on deleted block

---

## Mobile Strategy

### Approach: Adaptive UI

| Screen Width | Comment UI |
|--------------|------------|
| > 1024px | Side gutter (always visible) |
| 768-1024px | Side gutter (collapsible) |
| < 768px | Bottom sheet + badges |

### Mobile-Specific Features

1. **Comment count badges**
   - Small badge on blocks with comments
   - Shows unresolved count
   - Tap to open filtered sheet

2. **Bottom sheet**
   - Uses `react-modal-sheet` for smooth gestures
   - Three snap points: collapsed, half, full
   - Pull-to-refresh style dismiss

3. **Thread list in sheet**
   - Sorted by document position
   - Grouped by block (optional)
   - Tap to scroll to block in editor

4. **Reply flow on mobile**
   - Tap thread → expand inline
   - Keyboard pushes sheet up (viewport API)
   - Submit → collapse thread

### Library Recommendation

[react-modal-sheet](https://github.com/Temzasse/react-modal-sheet):
- Built with Framer Motion (smooth animations)
- Accessibility-minded
- Keyboard avoidance built-in
- ~8KB gzipped

---

## Effort Estimate

| Phase | Effort | Confidence |
|-------|--------|------------|
| Phase 1: Core Infrastructure | 8-12 hours | High |
| Phase 2: Thread Cards | 8-12 hours | High |
| Phase 3: Interactions | 6-8 hours | Medium |
| Phase 4: Mobile Support | 8-12 hours | Medium |
| Phase 5: Polish | 6-10 hours | Low |
| **Total** | **36-54 hours** | Medium |

### Assumptions
- Reuse existing Thread schema and Yjs storage
- BlockNote continues to handle text selection marks
- No backend changes needed
- HeroUI v3 components for UI

### Risks
- ProseMirror position APIs may be tricky
- Mobile keyboard handling complexity
- Thread stacking edge cases

---

## Comparison: Custom vs Fix BlockNote

### Custom Side-Gutter (Recommended)

**Pros:**
- Full control over UX
- Can optimize for our use cases
- Mobile-first design possible
- Independent of upstream bugs
- Clear scope and timeline

**Cons:**
- More initial development
- Maintaining our own code
- May diverge from BlockNote updates

### Fix BlockNote Bugs

**Pros:**
- Leverage existing UI
- Less custom code
- Upstream fixes benefit everyone

**Cons:**
- Unknown scope (content corruption is deep)
- May require ProseMirror expertise
- Blocked on upstream acceptance
- Could take weeks of investigation
- No mobile improvements

---

## Decision

**Build custom side-gutter system.**

Rationale:
1. BlockNote's inline comments have fundamental issues
2. We need mobile support that BlockNote doesn't prioritize
3. Custom gives us control over the entire UX
4. ~40-60 hours is reasonable and predictable
5. Aligns with existing Issue #29

---

## Next Steps

1. Create new branch for implementation
2. Start with Phase 1: position tracking hook
3. Build minimal gutter with hardcoded threads
4. Iterate on interactions
5. Add mobile support
6. Update Issue #29 with progress

---

## References

- [Issue #29: Notion-style anchored comments](https://github.com/SchoolAI/shipyard/issues/29)
- [Liveblocks AnchoredThreads](https://liveblocks.io/docs/api-reference/liveblocks-react-blocknote)
- [ProseMirror sidebar alignment discussion](https://discuss.prosemirror.net/t/vertically-align-sidebar-blocks-to-content/4775)
- [ProseMirror coordsAtPos](https://prosemirror.net/docs/ref/#view.EditorView.coordsAtPos)
- [react-modal-sheet](https://github.com/Temzasse/react-modal-sheet)
- [BlockNote API](https://www.blocknotejs.org/docs/reference/editor/overview)

---

*Plan created: 2026-01-27*
*Author: Claude Code*
