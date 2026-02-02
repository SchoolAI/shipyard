# TaskDocument & RoomDocument Class API Specification

**Date:** 2026-02-01
**Status:** Proposal based on comprehensive UI inventory
**Purpose:** Define exact API surface for loro-extended migration

---

## TaskDocument Class

### Constructor & Lifecycle

```typescript
constructor(
  taskDoc: TypedDoc<TaskDocumentSchema>,
  roomDoc: TypedDoc<RoomSchema>,
  taskId: TaskId
)

dispose(): void  // Cleanup subscriptions
get isDisposed(): boolean
```

---

### Readonly Container Accessors

**Pattern:** Expose CRDT containers directly as readonly refs instead of individual getters.

```typescript
// Core containers (direct CRDT access)
get meta(): ReadonlyStructRef<TaskMeta>
get content(): any  // For Tiptap/loro-prosemirror - Shape.any()
get comments(): ReadonlyRecordRef<string, TaskComment>
get artifacts(): ReadonlyListRef<TaskArtifact>
get deliverables(): ReadonlyListRef<TaskDeliverable>
get events(): ReadonlyListRef<TaskEvent>
get linkedPRs(): ReadonlyListRef<TaskLinkedPR>
get inputRequests(): ReadonlyListRef<TaskInputRequest>
get changeSnapshots(): ReadonlyRecordRef<MachineId, ChangeSnapshot>

// For editor integration
get loroDoc(): LoroDoc
// Editor uses: loroDoc.getMap("content").id for LoroSyncPlugin

// Usage examples:
const status = taskDoc.meta.status
const title = taskDoc.meta.title
const allArtifacts = taskDoc.artifacts.toJSON()
for (const artifact of taskDoc.artifacts.values()) { ... }
```

**Benefits:**
- No copying overhead
- Direct CRDT access for efficiency
- Callers can subscribe to specific containers
- ~20 getter methods collapsed into ~8 container accessors

---

### Metadata Mutations

```typescript
// Mutations (updates task + room index)
updateStatus(status: TaskStatus, actor: string): void
updateTitle(title: string, actor: string): void
setTags(tags: string[], actor: string): void
```

---

### Input Request Operations

```typescript
// Mutations only (read via taskDoc.inputRequests container)
addInputRequest(params: AddInputRequestParams): InputRequestId
answerInputRequest(
  requestId: InputRequestId,
  response: unknown,
  answeredBy: string
): void
declineInputRequest(requestId: InputRequestId): void
cancelInputRequest(requestId: InputRequestId): void
```

**Subscriptions:** Callers subscribe to `taskDoc.events` and filter for `input_request_*` event types.

---

### Thread/Comment Operations

```typescript
// Mutations only (read via taskDoc.comments container)
createThread(
  blockId: string,
  body: string,
  userId: string,
  selectedText?: string
): ThreadId

addReply(threadId: ThreadId, body: string, userId: string): CommentId
toggleThreadResolved(threadId: ThreadId): void
deleteThread(threadId: ThreadId): void
```

**Note:** Callers read threads via `taskDoc.comments` and subscribe via `loro(taskDoc.comments).subscribe(...)`

**Open Question:** Current schema has `comments: Shape.record(...)` discriminated by 'kind' (inline/pr/local/overall), but current UI uses "threads" concept. How do threads map to the comment schema?

**Note:** Comments have 4 kinds:
- `inline` - Thread comments on task content blocks
- `pr` - Comments on GitHub PR diffs
- `local` - Comments on local uncommitted changes
- `overall` - General task comments

Are threads == inline comments? Or do threads aggregate multiple comment kinds?

---

### Artifact Operations

```typescript
// Mutations only (read via taskDoc.artifacts container)
addArtifact(
  artifact: AddGitHubArtifactParams | AddLocalArtifactParams,
  storage: "github" | "local",
  actor: string
): ArtifactId

removeArtifact(artifactId: ArtifactId): void
```

---

### Deliverable Operations

```typescript
// Mutations only (read via taskDoc.deliverables container)
setDeliverables(deliverables: TaskDeliverable[]): void  // Initial set from content extraction
linkArtifactToDeliverable(
  deliverableId: DeliverableId,
  artifactId: ArtifactId,
  actor: string
): void

// Computed helper
get allDeliverablesLinked(): boolean  // Convenience - checks if all have linkedArtifactId
```

---

### Linked PR Operations

```typescript
// Mutations only (read via taskDoc.linkedPRs container)
linkPR(pr: LinkPRParams, actor: string): void
unlinkPR(prNumber: number): void
updateLinkedPRStatus(prNumber: number, status: PRStatus): void
```

---

### Change Snapshot Operations

```typescript
// Mutations only (read via taskDoc.changeSnapshots container)
setChangeSnapshot(snapshot: AddChangeSnapshotParams): void
markMachineDisconnected(machineId: MachineId): void
```

---

### Local Diff Comment Operations

```typescript
// Mutations only (read via taskDoc.comments container - discriminated by 'kind')
addLocalDiffComment(comment: AddLocalDiffCommentParams, actor: string): CommentId
resolveLocalDiffComment(commentId: CommentId, resolved: boolean): void
removeLocalDiffComment(commentId: CommentId): void

// Note: All comment kinds (inline, pr, local, overall) stored in taskDoc.comments
```

---

### Event Operations

```typescript
// Mutations only (read via taskDoc.events container)
// Usually internal to other operations
logEvent<T extends EventType>(
  type: T,
  actor: string,
  data?: EventData[T],
  options?: { inboxWorthy?: boolean; inboxFor?: string | string[] }
): EventId
```

---

### Snapshot Operations

**Open Question:** Does TaskDocumentSchema have a snapshots container? Need to verify in schema.

```typescript
// If snapshots exist:
// get snapshots(): ReadonlyListRef<Snapshot>

// Mutations (usually internal to status transitions)
createSnapshot(reason: string, actor: string, status: TaskStatus): void
```

---

### Subscriptions

**Pattern:** NO custom subscriptions. Callers subscribe directly to containers or events.

```typescript
// Callers subscribe to what they need:
loro(taskDoc.meta).subscribe(...)       // Metadata changes
loro(taskDoc.events).subscribe(...)     // All events (including input requests)
loro(taskDoc.artifacts).subscribe(...)  // Artifact changes
loro(taskDoc.comments).subscribe(...)   // Comment/thread changes

// For change detection, filter events:
loro(taskDoc.events).subscribe(() => {
  const recent = taskDoc.events.get(taskDoc.events.length - 1)
  if (recent.type === 'input_request_created') {
    // Handle new request
  }
})
```

**No methods needed** - direct CRDT subscription is cleaner and more flexible.

---

## RoomDocument Class

### Constructor & Lifecycle

```typescript
constructor(roomDoc: TypedDoc<RoomSchema>)
dispose(): void
```

---

### Task Index Operations

```typescript
// Readonly container accessor
get taskIndex(): ReadonlyRecordRef<TaskId, TaskIndexEntry>

// Convenience helpers (could also be done by callers)
getTasks(options?: { includeArchived?: boolean }): TaskIndexEntry[]  // Sorted by lastUpdated
getTasksWithPendingRequests(): TaskIndexEntry[]

// Mutations
addTask(params: {
  taskId: TaskId,
  title: string,
  status: TaskStatus,
  ownerId: string,
  hasPendingRequests?: boolean
}): void

updateTask(taskId: TaskId, updates: Partial<{
  title: string,
  status: TaskStatus,
  ownerId: string,
  hasPendingRequests: boolean
}>): void

removeTask(taskId: TaskId): void

// Low-level subscriptions done directly:
// loro(roomDoc.taskIndex).subscribe(...)
```

---

### ViewedBy Operations (Inbox Read State)

```typescript
// Readonly container accessors
get viewedBy(): ReadonlyRecordRef<TaskId, ReadonlyRecordRef<string, number>>
get eventViewedBy(): ReadonlyRecordRef<TaskId, ReadonlyRecordRef<EventId, ReadonlyRecordRef<string, number>>>

// Mutations
markPlanAsRead(taskId: TaskId, username: string): void
markPlanAsUnread(taskId: TaskId, username: string): void

markEventAsViewed(taskId: TaskId, eventId: EventId, username: string): void
clearEventViewedBy(taskId: TaskId, eventId: EventId, username: string): void

// Convenience helpers
isPlanUnread(taskId: TaskId, username: string, taskUpdatedAt: number): boolean
isEventUnread(taskId: TaskId, eventId: EventId, username: string): boolean
```

**Subscriptions:** Callers subscribe directly via `loro(roomDoc.viewedBy).subscribe(...)` or `loro(roomDoc.eventViewedBy).subscribe(...)`

---

### Navigation Target Operations

```typescript
// For daemon → browser navigation (open specific task)
getNavigationTarget(): TaskId | null
setNavigationTarget(taskId: TaskId): void
clearNavigationTarget(): void
```

**Open Question:** Is navigation target in RoomSchema or a separate ephemeral channel?

---

## Open Questions Summary

| # | Question | Impact |
|---|----------|--------|
| 1 | Threads vs Comments schema mapping | How do threads (UI concept) map to comments (schema) |
| 2 | Snapshots container in TaskDocumentSchema | Need to verify snapshots are in schema |
| 3 | Local diff comments storage | Separate container or part of comments discriminated union? |
| 4 | Navigation target location | RoomSchema or separate ephemeral? |
| 5 | viewedBy in TaskDocumentSchema.meta | We removed it, but current UI calls markPlanAsViewed on task doc - is this only RoomSchema or both? |
| 6 | Content export method | Do we need getContentAsBlocks() or is editor.getJSON() sufficient? |

---

## Features Intentionally Removed

| Feature | Reason |
|---------|--------|
| Approval workflow (approvalRequired, approvedUsers, rejectedUsers) | Access control via JWT + loro-extended visibility |
| Step completions | Not needed for v1 |
| origin field | Platform provenance not needed for v1 |
| viewedBy in TaskDocument.meta | Moved to RoomSchema only (per-user state) |

---

## Next Steps

1. **Answer open questions** - Verify schema for snapshots, local diff comments, navigation target
2. **Verify threads mapping** - Understand threads vs comments schema relationship
3. **Finalize class signatures** - Create actual TypeScript interface definitions
4. **Begin implementation** - Start with TaskDocument or RoomDocument

---

## Method Count (Final)

**TaskDocument:** ~18-20 methods
- ~9 readonly container accessors (meta, content, comments, artifacts, deliverables, events, linkedPRs, inputRequests, changeSnapshots)
- ~10-12 mutation methods
- NO custom subscriptions (callers use loro() directly)
- dispose()

**RoomDocument:** ~10-12 methods
- ~3 readonly container accessors (taskIndex, viewedBy, eventViewedBy)
- ~3 task index mutations
- ~4 viewedBy mutations
- ~2 navigation target methods
- ~2 convenience helpers (getTasks, isPlanUnread)
- NO custom subscriptions
- dispose()

**Massive simplification** from original ~50+ methods. Classes focus on:
1. ✅ Cross-doc coordination
2. ✅ Event logging
3. ✅ Validated mutations
4. ✅ Readonly container access
5. ❌ NO convenience getters
6. ❌ NO custom subscriptions (use loro() + events)
