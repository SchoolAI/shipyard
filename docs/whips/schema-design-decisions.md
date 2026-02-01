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
| **Global requests** | Extend plan-index doc | Already exists, add AGENTS key |
| **Validators** | Zod at boundaries | Shape = structure, Zod = validation |

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

### Solution: Extend plan-index Doc

**Current:** plan-index already stores:
- Plans registry
- Input requests (cross-plan)
- ViewedBy state

**Add:**
```typescript
// In plan-index doc
agents: Shape.record(
  Shape.struct({
    machineId: Shape.plain.string(),
    machineName: Shape.plain.string(),
    ownerId: Shape.plain.string(),
    sessionId: Shape.plain.string(),
    connectedAt: Shape.plain.number(),
    lastSeenAt: Shape.plain.number(),
    activePlans: Shape.list(Shape.plain.string()),  // planIds
  })
)
```

**Why plan-index:**
- Already exists and syncs globally
- Browser already connects to it
- Consistent with input requests pattern
- No signaling server coupling

**Don't use signaling server:**
- Ephemeral state only
- Not designed for data storage
- Cloudflare DO memory limits

---

## 9. Validators & Branded Types

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

### Immediate Changes to spikes/loro-schema/src/shapes.ts

- [ ] Add literal types: `status: Shape.plain.string('draft', 'pending_review', ...)`
- [ ] Add literal types: `type: Shape.plain.string('html', 'image', 'video')`
- [ ] Add literal types: All enum-like fields
- [ ] Keep flat metadata structure (don't nest GitHub/archive/session)
- [ ] Keep separate prReviewComments and localDiffComments
- [ ] Keep changeSnapshots (machineId → snapshot)
- [ ] Decide: Keep or remove presence audit trail
- [ ] Document that snapshots are for URLs, not time-travel
- [ ] Add comments field designs (cursor API vs blockId)

### Additional Files Needed

- [ ] Create validators.ts with Zod schemas
- [ ] Create types.ts with branded types
- [ ] Define global agent schema for plan-index extension
- [ ] Document permission model (still open)

### Week 1 Blockers Remaining

- [ ] Design permissions model (full design from scratch)
- [ ] Spike comment anchoring (Loro cursor API with Tiptap)
- [ ] Spike content structure (verify loro-prosemirror expects Shape.any())

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
