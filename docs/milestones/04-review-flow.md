# Milestone 4: Review Flow

**Status**: Not Started
**Goal**: Full annotation and review workflow

---

## Overview

Add the core review functionality:
1. Reviewers can add annotations to steps
2. Reviewers can approve or request changes
3. Agent can see feedback via MCP tool
4. Complete review cycle works

---

## Deliverables

### 4a: Annotation UI

- [ ] Add annotation button on each step
- [ ] Annotation form (type, content)
- [ ] Display existing annotations
- [ ] Reply to annotations
- [ ] Mark annotations as resolved

**Annotation types:**
- Question
- Concern
- Suggestion
- Approval

### 4b: Review Status UI

- [ ] Status badge (pending, approved, changes_requested)
- [ ] "Approve" button
- [ ] "Request Changes" button
- [ ] Confirmation before changing status

### 4c: MCP `get_feedback` Tool

- [ ] Returns new annotations since last check
- [ ] Returns current review status
- [ ] Agent can poll for updates

```typescript
server.tool(
  "get_feedback",
  { planId: z.string() },
  async ({ planId }) => {
    const handle = repo.get(planId, LiveStateSchema);
    const state = handle.doc.toJSON();
    return {
      status: state.reviewStatus,
      annotations: state.annotations,
    };
  }
);
```

### 4d: Annotation Notifications

- [ ] MCP server observes annotation changes
- [ ] Could log to console for now
- [ ] Future: actual notification system

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

### Annotation Schema (already defined)

```typescript
annotations: Shape.list(
  Shape.plain.struct({
    id: Shape.plain.string(),
    stepId: Shape.plain.string().nullable(),
    author: Shape.plain.string(),
    type: Shape.plain.string(),  // 'question' | 'concern' | 'suggestion' | 'approval'
    content: Shape.plain.string(),
    createdAt: Shape.plain.number(),
    resolved: Shape.plain.boolean(),
  })
),
```

### Adding Annotation

```typescript
function addAnnotation(handle, stepId: string, type: string, content: string) {
  handle.change(draft => {
    draft.annotations.push({
      id: crypto.randomUUID(),
      stepId,
      author: getAuthorId(), // From browser, could be anonymous or authenticated
      type,
      content,
      createdAt: Date.now(),
      resolved: false,
    });
  });
}
```

### Review Status

```typescript
function setReviewStatus(handle, status: 'approved' | 'changes_requested') {
  handle.change(draft => {
    draft.reviewStatus = status;
  });
}
```

---

## Dependencies

- Milestone 3 (Live Sync)

## Blocks

- Milestone 6 (P2P) - extends this with remote reviewers

---

*Created: 2026-01-02*
