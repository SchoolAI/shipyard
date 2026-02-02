# Loro Schema Design Decisions

**Research completed:** 2026-01-31
**9 parallel agents researched:** Enums, discriminated unions, metadata structure, snapshots, comments, validators, global requests

---

## Quick Answers

| Question | Answer | Reason |
|----------|--------|--------|
| **Enums** | `Shape.plain.string('val1', 'val2', ...)` + Zod at boundaries | Shape infers types, Zod validates |
| **Discriminated unions** | Flatten in Loro, validate with Zod on read | CRDT-friendly field-level merging |
| **Metadata structure** | Flat (current approach) | Better access patterns, field-level CRDT merging |
| **Snapshots** | Still needed | For URL versioning (different from Loro time-travel) |
| **PR vs local comments** | Keep separate | Different temporal models and validation |
| **Change snapshots** | Keep | Enables collaborative review on uncommitted code |
| **Presence audit trail** | Optional | Written but never read - decide if needed |
| **Global requests** | REMOVED | Tasks created in UI first, no general requests needed |
| **Validators** | Zod at boundaries | Shape = structure, Zod = validation |
| **Task index** | RoomSchema.taskIndex | Denormalized for dashboard, cross-doc helpers maintain consistency |
| **ownerId nullability** | Non-nullable | Tasks always have an owner |
| **Document isolation** | loro-extended visibility | Document-level permissions, one connection per room |
| **origin field** | Removed | Platform provenance not needed for v1, can add later if needed |
| **viewedBy location** | Nested in taskIndex | Per-task read state grouped with task metadata |
| **Approval workflow** | Removed | Access control via JWT + loro-extended visibility, not CRDT fields |
| **taskIndex structure** | Record (not List) | O(1) lookups by taskId for dashboard queries |
| **Step completions** | Removed | Not needed for v1 |

---

## 1. Enums

### Pattern: Literal Strings + Zod

```typescript
// Define constants
const TASK_STATUSES = ['draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'] as const;

// In Loro Shape
status: Shape.plain.string(...TASK_STATUSES),  // TypeScript infers union

// In Zod (for validation)
export const TaskStatusSchema = z.enum(TASK_STATUSES);
```

**Why:**
- Shape provides compile-time type inference
- Zod provides runtime validation at boundaries (ADR-0004)
- No native enum type in loro-extended

**Usage:**
```typescript
// Reading with validation
const status = TaskStatusSchema.parse(doc.meta.status);

// Type-safe
const isComplete = status === 'completed';  // ✅ Type narrows
const isBad = status === 'invalid';        // ❌ Type error
```

---

## 2. Discriminated Unions

### Decision: Flatten in Loro, Validate with Zod

```typescript
// Loro Shape (storage) - FLAT with nullables
meta: Shape.struct({
  status: Shape.plain.string('draft', 'pending_review', ...),
  reviewRequestId: Shape.plain.string().nullable(),
  reviewedAt: Shape.plain.number().nullable(),
  reviewedBy: Shape.plain.string().nullable(),
  completedAt: Shape.plain.number().nullable(),
  completedBy: Shape.plain.string().nullable(),
})

// Zod (validation) - DISCRIMINATED UNION
const PlanMetadataSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('draft') }),
  z.object({ status: z.literal('pending_review'), reviewRequestId: z.string() }),
  z.object({ status: z.literal('completed'), completedAt: z.number(), completedBy: z.string() }),
])
```

### Why Not Use Shape.plain.discriminatedUnion()?

**loro-extended DOES support it**, but:
- CRDT merge semantics are unclear (needs testing)
- Flattening is proven to work (current Yjs approach)
- Field-level merging is better for collaboration
- Each field can be updated independently

**When to use Shape discriminated unions:**
- Ephemeral data (presence, cursors)
- Read-only views
- Single-writer scenarios

---

## 3. Metadata Structure

### Decision: Keep Flat

```typescript
meta: Shape.struct({
  // Core
  id, title, status,
  // GitHub
  repo, pr,
  // Ownership
  ownerId,
  // Archive
  archivedAt, archivedBy,
  // Session
  epoch, sessionToken
})
```

**Why:**
- Field-level CRDT merging (better for concurrent edits)
- Simpler access patterns (`meta.repo` > `meta.github?.repo`)
- 60+ existing usages expect flat
- Nested objects = last-writer-wins on entire object (loses fine-grained merge)

**Alternative:** Use JSDoc comments for visual grouping, keep runtime flat

---

## 4. Snapshots

### Purpose: Plan Versions for URL Encoding

**NOT Loro time-travel** - different use cases:

| Snapshots | Loro Time-Travel |
|-----------|------------------|
| Manual at milestones | Automatic on every edit |
| URL versioning | Undo/redo and branching |
| Coarse (status changes) | Fine (every operation) |
| 2-3 key versions in URL | Full operation log |

**When created:**
- First deliverable linked
- Status transitions
- Task completion

**Still needed with Loro:** YES
- URLs need version history
- User-facing version timeline
- Loro's internal history is separate

---

## 5. Comments

### PR vs Local: Keep Separate

**prReviewComments:**
- Permanent (GitHub PR)
- No staleness (diff is immutable)
- Linked to `prNumber`

**localDiffComments:**
- Ephemeral (uncommitted code)
- Staleness tracking (baseRef + lineContentHash)
- Machine-scoped (machineId)

**Why separate:**
- Different temporal models
- Different validation (staleness detection)
- Different query patterns
- Type safety (discriminated union)

---

## 6. Change Snapshots

### Purpose: Machine-Specific Git Diffs

```typescript
changeSnapshots: Shape.record(Shape.plain.string())  // machineId → snapshot
```

**What it enables:**
- Collaborative review on uncommitted code
- View remote collaborators' pending changes
- Link local diff comments to machine's snapshot

**Still needed with Loro:**
- Domain requirement (not Yjs artifact)
- Could simplify liveness/debouncing with Loro

---

## 7. Presence

### Audit Trail: Optional

**Current:** Written but never read (no consumers)

**Purpose:** Historical record of agent connections

**Recommendation:**
- Remove if only tracking current sessions
- Keep if planning audit/replay features
- loro-extended provides ephemeral presence (different use case)

---

## 8. Global Agent Requests

### Status: SUPERSEDED (2026-02-01)

**Previous decision:** Extend plan-index doc with global input requests

**New decision:** Input requests live ONLY in TaskDocumentSchema
- Assumption: Tasks are always created in UI first (not by agents)
- No "general" input requests without a task context
- Collaborative: all peers with task access see and can answer requests
- Simplifies the data model significantly

**Why this works:**
- Same task doc syncs over multiple meshes (Personal Room + Collab Room)
- Input requests are part of task collaboration
- Dashboard aggregates from taskIndex.hasPendingRequests (denormalized flag)

---

## 9. RoomSchema & TaskIndex

### Decision: Denormalized Index for Dashboard

**RoomSchema** (renamed from GlobalRoomSchema):
```typescript
RoomSchema = Shape.doc({
  // Task metadata index keyed by taskId for O(1) lookups
  taskIndex: Shape.record(
    Shape.plain.struct({
      taskId: Shape.plain.string(),
      title: Shape.plain.string(),
      status: Shape.plain.string('draft', 'pending_review', ...),
      ownerId: Shape.plain.string(),  // Non-nullable
      hasPendingRequests: Shape.plain.boolean(),
      lastUpdated: Shape.plain.number(),
      createdAt: Shape.plain.number(),
    })
  ),

  // Plan-level read tracking: taskId → username → timestamp
  viewedBy: Shape.record(Shape.record(Shape.plain.number())),

  // Event-level read tracking: taskId → eventId → username → timestamp
  eventViewedBy: Shape.record(Shape.record(Shape.record(Shape.plain.number()))),
})
```

**Removed from TaskDocumentSchema.meta:**
- `origin` - Platform provenance not needed for v1
- `viewedBy` - Moved to RoomSchema (per-user state)
- `approvalRequired`, `approvedUsers`, `rejectedUsers` - Access control via JWT + visibility

**Removed from RoomSchema:**
- `inputRequests` - Now only in TaskDocumentSchema

**Added to RoomSchema:**
- `viewedBy` - Plan-level read tracking for inbox (taskId → username → timestamp)
- `eventViewedBy` - Event-level read tracking for inbox (taskId → eventId → username → timestamp)

**Why denormalized index:**
- Dashboard needs quick access to task metadata without loading full TaskDocuments
- O(1) lookups by taskId (Record instead of List)
- Avoids expensive queries when listing 50+ tasks
- Cross-document helpers ensure consistency between source and index
- RoomSchema is always synced (lightweight), TaskDocuments loaded on-demand

**Consistency strategy:**
- TaskDocument sync methods update RoomSchema.taskIndex as side effect
- TaskIndex is READ ONLY from RoomDocument perspective
- Only TaskDocument mutations update taskIndex metadata
- ViewedBy tracking (per-user state) is the ONLY field callers mutate directly in taskIndex

---

## 10. Cross-Document Coordination

### Pattern: Shared Helpers

Operations that affect both TaskDocument and RoomSchema use shared helpers in `@shipyard/loro-schema`:

```typescript
export function updateTaskStatus(
  taskDoc: MutableTaskDocument,
  roomDoc: MutableRoom,
  newStatus: TaskStatus
): void {
  // Update source of truth
  taskDoc.meta.status = newStatus
  taskDoc.meta.updatedAt = Date.now()

  // Update denormalized index (Record keyed by taskId)
  const taskEntry = this.roomDoc.taskIndex.get(this.taskId)
  if (taskEntry) {
    taskEntry.status = newStatus
    taskEntry.lastUpdated = Date.now()
  }
  // Note: This is internal to TaskDocument class, not exposed to callers
}
```

**Why helpers over events:**
- Synchronous, atomic updates
- Type-safe at compile time
- No event ordering concerns
- Shared between all peers (consistent behavior)

**Document isolation:**
- One WebRTC connection per room, multiple docs sync over it
- loro-extended's `visibility` permission controls which docs sync to which peers
- No sub-document encryption needed - document-level isolation is sufficient

---

## 11. Input Request Variant Fields

### Decision: Extract for Reuse in Multi Questions

**Problem:** Multi input requests have nested questions that should support all 8 input types (text, multiline, choice, confirm, number, email, date, rating). The field definitions were duplicated.

**Solution:** Extract variant-specific fields as constants:

```typescript
const TextInputVariantFields = {
  defaultValue: Shape.plain.string().nullable(),
  placeholder: Shape.plain.string().nullable(),
} as const

const NumberInputVariantFields = {
  min: Shape.plain.number().nullable(),
  max: Shape.plain.number().nullable(),
  format: Shape.plain.string("integer", "decimal", "currency", "percentage").nullable(),
  defaultValue: Shape.plain.number().nullable(),
} as const

// ... similar for email, date, choice, rating
```

**Usage:**
- Top-level input requests: `{ type: "text", ...InputRequestBaseFields, ...TextInputVariantFields }`
- Multi questions: `{ type: "text", message, ...TextInputVariantFields }`

**Benefits:**
- No duplication between top-level and multi-nested input requests
- Multi questions support all 8 input types (was only 3)
- Choice options in multi questions use full schema with label/value/description

---

## 12. Validators & Branded Types

### Pattern: Shape + Zod + Branded Types

```typescript
// 1. Shape (structure + type inference)
const TaskSchema = Shape.doc({
  meta: Shape.struct({
    id: Shape.plain.string(),
    sessionToken: Shape.plain.string().nullable(),
  })
})

// 2. Branded types (semantic safety)
type SessionToken = string & { __brand: 'JWT' }
type TaskId = string & { __brand: 'uuid' }

// 3. Zod (runtime validation)
const TaskMetaValidator = z.object({
  id: z.string().uuid(),
  sessionToken: z.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/).nullable(),
})

// 4. At boundaries
function getTaskMeta(doc): TaskMeta {
  const raw = doc.meta.toJSON();
  const validated = TaskMetaValidator.parse(raw);
  return {
    ...validated,
    id: validated.id as TaskId,
    sessionToken: validated.sessionToken as SessionToken | null,
  };
}
```

**Why this layering:**
- Shape = CRDT structure (sync layer)
- Zod = validation (boundary layer)
- Branded types = semantic safety (type layer)

**Shape does NOT support:**
- `.min()`, `.max()`, `.refine()`, `.transform()`
- These are Zod features

---

## Implementation Checklist

Based on all research findings:

### Implementation Status (Updated 2026-02-01)

**Completed:**
- [x] Add literal types: `status: Shape.plain.string('draft', 'pending_review', ...)`
- [x] Add literal types: `type: Shape.plain.string('html', 'image', 'video')`
- [x] Add literal types: All enum-like fields
- [x] Keep flat metadata structure (don't nest GitHub/archive/session)
- [x] Keep separate pr/local/inline/overall comments (discriminated union by 'kind')
- [x] Keep changeSnapshots (machineId → snapshot)
- [x] Create validators.ts with Zod schemas
- [x] Create types.ts with branded types
- [x] Rename GlobalRoomSchema → RoomSchema
- [x] Add taskIndex to RoomSchema
- [x] Remove inputRequests from RoomSchema
- [x] Make ownerId non-nullable
- [x] Extract input variant fields for reuse in multi questions
- [x] Multi questions support all 8 input types
- [x] taskIndex changed from List to Record for O(1) lookups
- [x] viewedBy and eventViewedBy nested in taskIndex entries
- [x] origin, approval fields removed from TaskDocumentSchema.meta

**Remaining:**
- [ ] Build TaskDocument class with cross-doc helpers
- [ ] Build RoomDocument class
- [ ] Implement loro-extended visibility permissions
- [ ] Wire JWT scope to permission checks

---

## Key Insights

1. **Shape is minimal by design** - No validation, just structure + types
2. **Zod complements Shape** - Use both (Shape for CRDT, Zod for boundaries)
3. **Flat is better for CRDTs** - Field-level merging beats object-level
4. **plan-index is the global doc** - Already exists, use it for agent registry
5. **Discriminated unions work differently** - Store flat, validate with Zod
6. **Current patterns are sound** - Most design decisions proven in production

---

This research validates the existing architecture while clarifying how to adapt it for Loro.
