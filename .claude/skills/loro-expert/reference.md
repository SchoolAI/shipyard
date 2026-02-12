# Loro Extended API Reference

## Shape System

### Container Shapes (CRDT — merge semantics)

| Shape | Loro Type | Usage |
|---|---|---|
| `Shape.text()` | LoroText | Collaborative rich text |
| `Shape.counter()` | LoroCounter | Convergent increment/decrement |
| `Shape.list(item)` | LoroList | Ordered list |
| `Shape.movableList(item)` | LoroMovableList | List with move operations |
| `Shape.struct({ ... })` | LoroMap | Fixed-key map (fields merge independently) |
| `Shape.record(value)` | LoroMap | Dynamic-key map (like Record<string, T>) |
| `Shape.tree(data)` | LoroTree | Hierarchical tree/forest |
| `Shape.any()` | any | Escape hatch (e.g., loro-prosemirror) |

### Value Shapes (plain — Last Write Wins)

| Shape | Type |
|---|---|
| `Shape.plain.string('opt1', 'opt2')` | string (optional union) |
| `Shape.plain.number()` | number |
| `Shape.plain.boolean()` | boolean |
| `Shape.plain.null()` | null |
| `Shape.plain.bytes()` | Uint8Array |
| `Shape.plain.any()` | any Loro Value |
| `Shape.plain.struct({ ... })` | Fixed-key plain object |
| `Shape.plain.record(value)` | Dynamic-key plain object |
| `Shape.plain.array(value)` | Plain array |
| `Shape.plain.union([s1, s2])` | Union type |
| `Shape.plain.discriminatedUnion(key, { v: shape })` | Tagged union |

### Modifiers

```ts
Shape.plain.string().nullable()             // string | null
Shape.text().placeholder("Untitled")        // Default before real data
Shape.counter().placeholder(0)
```

### Document Schema

```ts
const MySchema = Shape.doc({
  title: Shape.text(),
  count: Shape.counter(),
  items: Shape.list(Shape.plain.struct({ id: Shape.plain.string(), done: Shape.plain.boolean() })),
  metadata: Shape.struct({ author: Shape.plain.string() }),
  settings: Shape.record(Shape.plain.string()),
}, { mergeable: true })  // optional: flattened storage for concurrent creation
```

### Type Inference

```ts
type MyDoc = Infer<typeof MySchema>                // plain JSON type
type MyMutable = InferMutableType<typeof MySchema>  // mutable ref type
```

## Mutation with change()

```ts
import { createTypedDoc, change, loro, ext } from "@loro-extended/change"

const doc = createTypedDoc(MySchema)

change(doc, draft => {
  draft.title.insert(0, "Hello")           // Text
  draft.count.increment(5)                  // Counter
  draft.items.push({ id: "1", done: false }) // List
  draft.metadata.author = "Alice"           // Struct field
  draft.settings.set("theme", "dark")       // Record
  draft.settings.delete("old")              // Record delete
})

// Escape hatches
const loroDoc = loro(doc)       // raw LoroDoc
const loroText = loro(textRef)  // raw LoroText
ext(doc).fork()                 // fork document
ext(doc).mergeable              // check if mergeable
```

## Repo & Handle

### Repo Setup

```ts
import { Repo } from "@loro-extended/repo"

const repo = new Repo({
  identity: { name: "my-peer", type: "service" },
  adapters: [storageAdapter, networkAdapter],
  permissions: {
    visibility: (doc, peer) => true,
    mutability: (doc, peer) => peer.channelKind === "storage",
  },
})
```

### Handle API

```ts
const handle = repo.get("doc-id", MySchema, ephemeralShapes?)

handle.doc          // TypedDoc<MySchema>
handle.loroDoc      // raw LoroDoc
handle.docId        // string

// Subscribe to all changes
handle.subscribe((event) => { /* LoroEventBatch */ })

// Subscribe to path (type-safe)
handle.subscribe(p => p.metadata.author, (value, prev) => {})

// Wait for sync
await handle.waitForSync()                          // network, 30s
await handle.waitForSync({ kind: "storage" })
await handle.waitForSync({ kind: "network", timeout: 5000 })

// Initialize pattern
await handle.waitForSync()
if (handle.loroDoc.opCount() === 0) {
  change(handle.doc, draft => { /* set defaults */ })
}
```

### Ephemeral Stores

Ephemeral stores hold transient state that is NOT persisted — only synced between connected peers. `handle.presence` is a convenience accessor for the default presence ephemeral store.

```ts
// Presence (convenience pattern via handle.presence)
const PresenceSchema = Shape.plain.struct({ name: Shape.plain.string(), cursor: Shape.plain.number() })
const handle = repo.get("doc-id", DocSchema, { presence: PresenceSchema })

handle.presence.setSelf({ name: "Alice", cursor: 42 })
handle.presence.self          // my value
handle.presence.peers         // Map<string, T>
handle.presence.subscribe(({ key, value, source }) => {})

// Generic ephemeral stores (accessed by name)
const store = handle.getTypedEphemeral(name)
```

## React Hooks

```tsx
import { RepoContext, useHandle, useDoc, useEphemeral, useRepo } from "@loro-extended/react"

// Provider
<RepoContext.Provider value={repo}><App /></RepoContext.Provider>

// useHandle — stable reference, never re-renders
const handle = useHandle("doc-id", DocSchema)

// useDoc — reactive snapshot (re-renders on change)
const doc = useDoc(handle)                           // full snapshot
const title = useDoc(handle, d => d.meta.title)      // selector (fine-grained)

// useEphemeral — presence/transient state
const { self, peers } = useEphemeral(handle.presence)

// useRepo — access repo from context
const repo = useRepo()

// useCollaborativeText — collaborative text input/textarea
const { value, onChange } = useCollaborativeText(handle, d => d.title)

// useUndoManager — undo/redo with shared namespaces
const { undo, redo, canUndo, canRedo } = useUndoManager(handle)

// useRefValue — ref value reactivity
const ref = useRefValue(handle, d => d.someField)

// useLens — filtered worldview (requires @loro-extended/lens)
const filtered = useLens(lens)
const value = useLens(lens, selector)
```

## Adapters

### Storage
- `@loro-extended/adapter-indexeddb` — Browser
- `@loro-extended/adapter-leveldb` — Node.js
- `@loro-extended/adapter-postgres` — Node.js

### Network
- `@loro-extended/adapter-websocket` — WebSocket
- `@loro-extended/adapter-websocket-compat` — WebSocket (compatibility)
- `@loro-extended/adapter-sse` — Server-Sent Events
- `@loro-extended/adapter-webrtc` — Peer-to-peer
- `@loro-extended/adapter-http-polling` — HTTP polling

### Testing with Bridge

```ts
import { Bridge, BridgeAdapter } from "@loro-extended/repo"
const bridge = new Bridge()
const repoA = new Repo({ adapters: [new BridgeAdapter({ adapterType: "a", bridge })] })
const repoB = new Repo({ adapters: [new BridgeAdapter({ adapterType: "b", bridge })] })
```

## Advanced

### Mergeable Documents
All containers stored at root with path-based names. Lists of containers NOT supported with mergeable — use Record instead.

### Diff Overlay
```ts
const overlay = createDiffOverlay(loroDoc, batch)
const beforeDoc = createTypedDoc(schema, { doc: loroDoc, overlay })
```

### Lenses
```ts
const lens = createLens(world, { filter: (commit) => commit.message?.userId === "alice" })
```

### Path Subscriptions
```ts
handle.subscribe(p => p.items.$each.done, (values) => {})
handle.subscribe("$.items[?@.price>10].title", (titles) => {})
```
