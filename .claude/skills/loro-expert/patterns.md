# Loro Extended — Shipyard Patterns

## Schema File Structure

Shipyard extracts shared fields into constants and spreads them:

```ts
// packages/loro-schema/src/shapes.ts
const baseEventFields = {
  id: Shape.plain.string(),
  type: Shape.plain.string('task_created', 'status_changed', ...),
  timestamp: Shape.plain.number(),
  actorName: Shape.plain.string().nullable(),
};

const TaskEventShape = Shape.plain.discriminatedUnion('type', {
  task_created: Shape.plain.struct({ ...baseEventFields, ... }),
  status_changed: Shape.plain.struct({ ...baseEventFields, fromStatus: ..., toStatus: ... }),
});
```

## Document Class Pattern

Wrap TypedDoc in a class with typed accessors and cross-doc sync:

```ts
// packages/loro-schema/src/task/document.ts
export class TaskDocument {
  constructor(private handle: Handle<typeof TaskDocumentSchema>) {}

  get meta() { return this.handle.doc.meta }
  get content() { return this.handle.doc.content }
  get events() { return this.handle.doc.events }
  get taskDoc() { return this.handle.doc }

  logEvent(event: TaskEvent) {
    change(this.handle.doc, d => { d.events.push(event) })
    this.syncToRoom()  // cross-doc update
  }

  private syncToRoom() {
    // Update RoomDocument's taskIndex with denormalized metadata
  }
}
```

## Epoch-Based Reset

CRDTs make reset hard (peers re-sync old data). Shipyard uses epoch numbers:

```ts
// packages/loro-schema/src/epoch.ts
// Server rejects clients with old epochs via WebSocket close code 4100
// Client clears local storage and reconnects with new epoch
```

## Repo Singleton (Server)

```ts
// apps/server/src/loro/repo.ts
const repo = new Repo({
  identity: { name: "shipyard-server", type: "service" },
  adapters: [leveldbAdapter, websocketAdapter, webrtcAdapter],
})
```

## React Selector Pattern

```ts
// apps/web/src/loro/selectors/task-selectors.ts
export function useTaskHandle(taskId: TaskId) {
  return useHandle(taskId, TaskDocumentSchema)
}

export function useTaskMeta(taskId: TaskId) {
  const handle = useTaskHandle(taskId)
  return useDoc(handle, d => d.meta)
}

export function useTaskTitle(taskId: TaskId) {
  const handle = useTaskHandle(taskId)
  return useDoc(handle, d => d.meta.title)
}
```

## Key File Paths

### loro-extended repo
- Shape system: `packages/change/src/shape.ts`
- TypedDoc: `packages/change/src/typed-doc.ts`
- change(): `packages/change/src/functional-helpers.ts`
- Repo: `packages/repo/src/repo.ts`
- Handle: `packages/repo/src/handle.ts`
- React hooks: `packages/hooks-core/src/create-hooks.ts`

### Shipyard
- Shapes: `packages/loro-schema/src/shapes.ts`
- TaskDocument: `packages/loro-schema/src/task/document.ts`
- RoomDocument: `packages/loro-schema/src/room/document.ts`
- React selectors: `apps/web/src/loro/selectors/task-selectors.ts`
- Server repo: `apps/server/src/loro/repo.ts`

## Common Gotchas

1. **Container vs Value**: `Shape.struct()` = LoroMap (fields merge independently). `Shape.plain.struct()` = plain value (entire object LWW). Use containers for concurrent field editing.
2. **waitForSync before initialize**: Always await sync before checking `opCount() === 0` to avoid duplicate initial state.
3. **Mergeable lists unsupported**: `Shape.list(Shape.struct({...}))` does NOT work with `mergeable: true`. Use `Shape.record()` instead.
4. **change() creates drafts**: Inside `change()`, plain values are cached and flushed at end. Container refs write directly.
5. **commit() is idempotent**: No-op without changes. No nesting depth tracking needed.
6. **Fork peer IDs**: When forking: `loro(fork).setPeerId(loro(doc).peerId)`.
7. **Reserved prefix**: Never use `_loro_extended` as root container key prefix.
8. **Subscription timing**: Batch assignments suppress auto-commit during property iteration, then commit once.
9. **Frontiers not version vectors**: Use `doc.frontiers()` for debugging, not `doc.version().toJSON()`.
10. **Shape.any() for external libs**: Use for loro-prosemirror content — don't try to type it.
