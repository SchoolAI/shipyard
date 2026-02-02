# TaskDocument & RoomDocument Class API Specification

**Date:** 2026-02-01
**Status:** Minimal viable API
**Pattern:** Thin coordination layer over Loro containers

---

## Design Philosophy

Classes provide:
1. **Mutable container accessors** - Direct CRDT access for reads and writes
2. **Sync methods** - ONLY for cross-doc coordination (the hard part)
3. **Event helper** - Convenience for logging timeline events
4. **Lifecycle** - dispose() for cleanup

Classes do NOT provide:
- ❌ Convenience getters (use containers directly)
- ❌ Custom subscriptions (use `loro()` + events)
- ❌ Wrapper methods for simple container operations (push, set, delete)

**Callers are responsible for:**
- Mutating containers directly
- Logging events (optional but recommended)
- Calling sync methods when needed (documented)

---

## TaskDocument Class

### Container Accessors (Mutable)

```typescript
// Core containers - direct read/write access
get meta(): MutableStructRef<TaskMeta>
get content(): any  // Shape.any() - loro-prosemirror manages this
get comments(): MutableRecordRef<CommentId, TaskComment>
get artifacts(): MutableListRef<TaskArtifact>
get deliverables(): MutableListRef<TaskDeliverable>
get events(): MutableListRef<TaskEvent>
get linkedPRs(): MutableListRef<TaskLinkedPR>
get inputRequests(): MutableListRef<TaskInputRequest>
get changeSnapshots(): MutableRecordRef<MachineId, ChangeSnapshot>

// For editor integration
get loroDoc(): LoroDoc
// Editor uses: loroDoc.getMap("content").id for LoroSyncPlugin
```

**Usage:**
```typescript
// Read
const status = taskDoc.meta.status
const title = taskDoc.meta.title
const allArtifacts = taskDoc.artifacts.toJSON()

// Write
taskDoc.meta.title = "New Title"
taskDoc.artifacts.push(newArtifact)
taskDoc.comments.set(commentId, comment)

// Subscribe
loro(taskDoc.meta).subscribe(() => {...})
loro(taskDoc.events).subscribe(() => {...})  // All events
```

---

### Cross-Doc Sync Methods (Only 3!)

```typescript
/**
 * Update task status and sync to room index.
 * Handles status transition logic.
 *
 * Cross-doc updates:
 * - taskDoc.meta.status
 * - taskDoc.meta.updatedAt
 * - taskDoc.meta.completedAt/completedBy (if completed)
 * - roomDoc.taskIndex[taskId].status
 * - roomDoc.taskIndex[taskId].lastUpdated
 * - Logs status_changed event
 */
updateStatus(status: TaskStatus, actor: string): void

/**
 * Sync title to room index.
 * Call after mutating meta.title directly.
 *
 * Cross-doc updates:
 * - roomDoc.taskIndex[taskId].title
 * - roomDoc.taskIndex[taskId].lastUpdated
 */
syncTitleToRoom(): void

/**
 * Recalculate hasPendingRequests flag and sync to room index.
 * Call after ANY mutation to inputRequests list (add, answer, decline, cancel).
 *
 * Cross-doc updates:
 * - roomDoc.taskIndex[taskId].hasPendingRequests
 * - roomDoc.taskIndex[taskId].lastUpdated
 */
syncPendingRequestsToRoom(): void
```

---

### Event Helper

```typescript
/**
 * Log an event to the timeline.
 * Convenience wrapper that auto-fills timestamp and generates ID.
 */
logEvent<T extends EventType>(
  type: T,
  actor: string,
  data?: EventData[T],
  options?: { inboxWorthy?: boolean; inboxFor?: string | string[] }
): EventId
```

---

### Lifecycle

```typescript
constructor(
  taskDoc: TypedDoc<TaskDocumentSchema>,
  roomDoc: TypedDoc<RoomSchema>,
  taskId: TaskId
)

/**
 * Cleanup internal state. Container subscriptions managed by callers.
 */
dispose(): void
```

---

### Usage Examples

#### Add Input Request
```typescript
const id = generateInputRequestId()
taskDoc.inputRequests.push({
  type: 'text',
  id,
  message: "What color?",
  status: 'pending',
  createdAt: Date.now(),
  expiresAt: Date.now() + 86400000,
  response: null,
  answeredAt: null,
  answeredBy: null,
  isBlocker: null,
  defaultValue: null,
  placeholder: null,
})
taskDoc.logEvent('input_request_created', actor, { requestId: id })
taskDoc.syncPendingRequestsToRoom()
```

#### Answer Input Request
```typescript
const requests = taskDoc.inputRequests.toJSON()
const idx = requests.findIndex(r => r.id === requestId)
const request = taskDoc.inputRequests.get(idx)

request.status = 'answered'
request.response = response
request.answeredAt = Date.now()
request.answeredBy = answeredBy

taskDoc.logEvent('input_request_answered', actor, { requestId })
taskDoc.syncPendingRequestsToRoom()
```

#### Add Artifact
```typescript
const artifact = createGitHubArtifact({
  type: 'image',
  filename: 'screenshot.png',
  url: 'https://...'
})
taskDoc.artifacts.push(artifact)
taskDoc.logEvent('artifact_uploaded', actor, {
  artifactId: artifact.id,
  filename: artifact.filename
})
```

#### Create Thread
```typescript
const comment = createInlineComment({
  threadId: generateThreadId(),
  body: "Nice work!",
  author: userId,
  blockId: blockId,
})
taskDoc.comments.set(comment.id, comment)
taskDoc.logEvent('comment_added', actor, {
  commentId: comment.id,
  threadId: comment.threadId
})
```

---

## RoomDocument Class

### Container Accessors (Readonly)

```typescript
/**
 * Task index with nested viewedBy tracking.
 *
 * Structure: taskId → {
 *   taskId, title, status, ownerId, hasPendingRequests, lastUpdated, createdAt,
 *   viewedBy: username → timestamp,
 *   eventViewedBy: eventId → username → timestamp
 * }
 *
 * READ ONLY - Do not mutate directly. TaskDocument sync methods update this.
 */
get taskIndex(): ReadonlyRecordRef<TaskId, TaskIndexEntry>
```

**Note:** RoomDocument has NO mutation methods. TaskIndex is updated by TaskDocument's sync methods as a side effect.

---

### Convenience Helpers (Read-Only)

```typescript
/**
 * Get all tasks sorted by lastUpdated.
 */
getTasks(options?: { includeArchived?: boolean }): TaskIndexEntry[]

/**
 * Get tasks with hasPendingRequests = true.
 */
getTasksWithPendingRequests(): TaskIndexEntry[]

/**
 * Check if a task is unread for a user.
 * Compares viewedBy timestamp against task's lastUpdated.
 */
isTaskUnread(taskId: TaskId, username: string): boolean

/**
 * Check if a specific event is unread for a user.
 */
isEventUnread(taskId: TaskId, eventId: EventId, username: string): boolean
```

**Note:** All mutations to taskIndex happen via TaskDocument sync methods as side effects. RoomDocument only provides read access.

---

### Lifecycle

```typescript
constructor(roomDoc: TypedDoc<RoomSchema>)
dispose(): void  // Cleanup (minimal - no subscriptions managed)
```

---

### Usage Examples

#### Read Tasks
```typescript
const tasks = roomDoc.getTasks()
const unreadTasks = tasks.filter(t => roomDoc.isTaskUnread(t.taskId, username))
const inboxEvents = tasks.flatMap(t => t.inboxEvents)
```

#### Mark as Read (Direct Container Mutation - ViewedBy Only)
```typescript
// ViewedBy is per-user UI state - safe to mutate directly
const task = roomDoc.taskIndex.get(taskId)
task.viewedBy.set(username, Date.now())
```

#### Mark Event as Read (Direct Container Mutation - ViewedBy Only)
```typescript
const task = roomDoc.taskIndex.get(taskId)
const eventViewedByUser = task.eventViewedBy.get(eventId) ?? task.eventViewedBy.set(eventId, new Map())
eventViewedByUser.set(username, Date.now())
```

#### Task Creation (Factory Pattern)
```typescript
// Factory/service handles creating both task and index entry
function createTask(roomDoc, params) {
  const taskId = generateTaskId()

  // 1. Create task doc
  const taskDoc = createTypedDoc(TaskDocumentSchema)
  taskDoc.meta.id = taskId
  taskDoc.meta.title = params.title
  // ...

  // 2. Add to room index
  roomDoc.taskIndex.set(taskId, {
    taskId,
    title: params.title,
    status: 'draft',
    ownerId: params.ownerId,
    hasPendingRequests: false,
    lastUpdated: Date.now(),
    createdAt: Date.now(),
    viewedBy: {},
    eventViewedBy: {},
    inboxEvents: [],
  })

  // 3. Return wrapped TaskDocument
  return new TaskDocument(taskDoc, roomDoc, taskId)
}
```

**Note:** Only viewedBy/eventViewedBy are mutated directly by callers (per-user UI state). All other taskIndex fields are updated by TaskDocument sync methods.

---

## Resolved Questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Snapshots container? | **Not needed in CRDT.** Snapshots generated dynamically from URL encoding, not stored in schema. |
| 2 | Navigation target? | **Not needed.** Will handle daemon → browser navigation differently. |
| 3 | Threads vs Comments? | **Threads = UI grouping.** Flat comments with `threadId` + `inReplyTo` for threading. Root comment (`inReplyTo: null`) represents thread. No schema changes needed. |
| 4 | ViewedBy structure? | **Nested in taskIndex.** Both viewedBy and eventViewedBy live inside each task entry. |
| 5 | Task index mutations? | **Read-only from RoomDocument.** Only TaskDocument sync methods update taskIndex. |

---

## Method Count Summary

**TaskDocument:** 13 total
- 9 container accessors
- 3 sync methods
- 1 event helper
- dispose()

**RoomDocument:** 5 total
- 1 container accessor (taskIndex with nested viewedBy)
- 3 convenience helpers (getTasks, getTasksWithPendingRequests, isTaskUnread, isEventUnread)
- dispose()

**Total:** 18 methods across both classes (was ~50)

**Key simplifications:**
- RoomDocument has NO mutation methods (taskIndex updated by TaskDocument only)
- ViewedBy nested in taskIndex (not separate containers)
- No snapshots container (dynamically generated from URL)
- No navigation target (not needed in schema)

---

## Benefits of Minimal API

1. **Simpler to implement** - 3 sync methods vs 15+ mutation wrappers
2. **Simpler to test** - Test sync logic, not wrappers
3. **More flexible** - Callers can compose operations however they want
4. **Matches CRDT philosophy** - Expose the data, provide helpers for hard parts
5. **Easier to maintain** - Less code to maintain
6. **Still protects** - Cross-doc coordination encapsulated, type safety enforced

---

## What Callers Must Remember

1. **Call sync methods** after mutations that affect room index:
   - After `meta.title` changes → `syncTitleToRoom()`
   - After `inputRequests` changes → `syncPendingRequestsToRoom()`
   - After `meta.status` changes → use `updateStatus()` (handles sync)

2. **Log events** (optional):
   - Use `logEvent()` helper for timeline
   - If forgotten, just missing audit trail

3. **Use factories** for object creation:
   - `createInlineComment(params)` → proper structure
   - `createGitHubArtifact(params)` → proper structure
   - Available from `@shipyard/loro-schema`

---

## Implementation Priority

**Phase 1: Core sync logic**
- TaskDocument with 3 sync methods
- RoomDocument with 0 methods (just container accessors)

**Phase 2: Convenience helpers (if needed)**
- Add back specific methods if callers struggle
- Start minimal, grow based on actual pain points

**Phase 3: Advanced (if needed)**
- Custom subscriptions for complex change detection
- Validation helpers beyond type system
