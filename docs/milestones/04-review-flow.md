# Milestone 4: Review Flow

**Status**: ✅ Complete
**Goal**: Full annotation and review workflow

---

## Overview

Add the core review functionality using BlockNote's native comments:
1. Reviewers can add comments/annotations to blocks
2. Reviewers can approve or request changes (via plan status)
3. Agent can see feedback via MCP tool
4. Complete review cycle works

**Key change:** Using BlockNote's built-in `YjsThreadStore` for comments instead of custom annotation system.

---

## Deliverables

### 4a: BlockNote Comments Integration

- [x] Enable BlockNote `CommentsExtension`
- [x] Configure `YjsThreadStore` for comment sync
- [x] Add comment UI (BlockNote provides this)
- [x] Display existing comments
- [x] Reply to comments (threaded)
- [x] Mark comments as resolved

**Comment features (built-in to BlockNote):**
- Threaded replies
- Emoji reactions
- User mentions
- Resolution status

### 4b: Review Status UI

- [x] Status badge (pending, approved, changes_requested)
- [x] "Approve" button
- [x] "Request Changes" button
- [x] Confirmation before changing status

### 4c: Agent Feedback via `read_plan` Tool

- [x] Returns comments from Y.Doc threads via `includeAnnotations` parameter
- [x] Returns current review status from metadata
- [x] Agent can read annotations and respond

**Implementation**: The `read_plan` tool with `includeAnnotations: true` exports the plan with all comment threads included in markdown format. See `apps/server/src/tools/read-plan.ts` and `apps/server/src/export-markdown.ts` for implementation.

```typescript
// Agent calls this to get feedback:
read_plan({
  planId: "abc123",
  includeAnnotations: true
})
// Returns markdown with inline comment threads
```

### 4d: Y.Doc Change Observation

- [x] MCP server subscribes to Y.Doc updates
- [x] Logs when comments are added
- [ ] Could trigger notifications in future (M7+)

---

## Demo Checkpoint

**Scenario**: Complete review cycle

```
1. Agent creates plan
2. Reviewer opens in browser
3. Reviewer adds annotation: "Should also handle refresh tokens"
4. Agent calls get_feedback, sees annotation
5. Agent could update plan (creates new version/URL)
6. Reviewer marks as approved
7. Agent sees approval status
```

---

## Success Criteria

1. Can add/view/reply to annotations
2. Can change review status
3. Agent can retrieve feedback via MCP tool
4. Changes sync in real-time

---

## Technical Notes

### BlockNote Comments Setup

```typescript
import { BlockNoteEditor } from '@blocknote/core';
import { YjsThreadStore } from '@blocknote/core';
import * as Y from 'yjs';

// Create editor with comments extension
const editor = useCreateBlockNote({
  collaboration: {
    provider: wsProvider,
    fragment: ydoc.getXmlFragment('document'),
  },
  _tiptapOptions: {
    extensions: [
      CommentsExtension.configure({
        threadStore: new YjsThreadStore(
          userId,
          ydoc.getMap('threads'),
          new DefaultThreadStoreAuth(userId, 'editor')
        ),
      }),
    ],
  },
});
```

### Reading Comments from MCP Server

```typescript
function getComments(ydoc: Y.Doc) {
  const threads = ydoc.getMap('threads');
  return threads.toJSON(); // Returns all comments
}
```

### Review Status

```typescript
function setReviewStatus(ydoc: Y.Doc, status: 'approved' | 'changes_requested') {
  const metadata = ydoc.getMap('metadata');
  metadata.set('status', status);
  metadata.set('updatedAt', Date.now());
}
```

---

## Dependencies

- Milestone 3 (Live Sync)

## Blocks

- Milestone 6 (P2P) - extends this with remote reviewers

---

*Created: 2026-01-02*
*Updated: 2026-01-04*
