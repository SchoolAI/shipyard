---
name: loro-expert
description: "Expert at loro-extended CRDT library. Use when working with Shapes, TypedDocs, Repo/Handle, adapters, React hooks, or any CRDT-related code in Shipyard. Covers @loro-extended/change, @loro-extended/repo, @loro-extended/react, and all adapter packages."
---

# Loro Extended Expert

## What is Loro Extended?

A typed, schema-driven toolkit built on top of [Loro](https://github.com/loro-dev/loro) (a Rust CRDT engine). It adds schemas, sync, persistence, and reactivity so you focus on app logic instead of distributed state plumbing.

**Layered architecture:**
- `@loro-extended/change` -- Schema (Shape), TypedDoc, `change()`, `loro()`, `ext()`
- `@loro-extended/repo` -- Document lifecycle, sync engine, Handle, adapters
- `@loro-extended/react` -- React hooks: useHandle, useDoc, useEphemeral, useLens
- Adapters -- Storage (IndexedDB, LevelDB, Postgres) and Network (WebSocket, SSE, WebRTC, HTTP-polling)

## Shape System (Quick Reference)

**Container shapes** (CRDT containers with identity):
```typescript
Shape.struct({ name: Shape.plain.string() })  // LoroMap with fixed keys
Shape.list(itemShape)                          // LoroList
Shape.record(valueShape)                       // LoroMap with dynamic keys
Shape.text()                                   // LoroText
Shape.counter()                                // LoroCounter
Shape.any()                                    // Untyped LoroMap (escape hatch)
```

**Value shapes** (plain JSON, no CRDT identity):
```typescript
Shape.plain.string()                           // string
Shape.plain.string('a', 'b', 'c')             // string literal union
Shape.plain.number()                           // number
Shape.plain.boolean()                          // boolean
Shape.plain.null()                             // null
Shape.plain.struct({ ... })                    // plain object (no LoroMap)
Shape.plain.array(itemShape)                   // plain array
Shape.plain.record(valueShape)                 // plain Record<string, T>
Shape.plain.union([shapeA, shapeB])            // union type
Shape.plain.discriminatedUnion('key', { ... }) // tagged union
```

**Modifiers:** `.nullable()`, `.placeholder(defaultValue)`

**Doc shape:**
```typescript
const MySchema = Shape.doc({
  meta: Shape.struct({ title: Shape.plain.string() }),
  items: Shape.list(Shape.plain.struct({ id: Shape.plain.string() })),
});
```

## Mutation with change()

```typescript
import { change, createTypedDoc, Shape } from "@loro-extended/change";

const doc = createTypedDoc(MySchema);

// Mutate via change() -- auto-commits
change(doc, draft => {
  draft.meta.title = "Hello";
  draft.items.push({ id: "1" });
});
```

**Escape hatches:**
```typescript
import { loro, ext } from "@loro-extended/change";
const loroDoc = loro(doc);          // Get raw LoroDoc
ext(doc).forkAt(frontiers);         // Fork at version
ext(doc).initialize();              // Write metadata
```

## Repo / Handle

```typescript
import { Repo } from "@loro-extended/repo";

const repo = new Repo({
  identity: { name: "my-peer" },
  adapters: [storageAdapter, networkAdapter],
  permissions: { visibility: (doc, peer) => true },
});

const handle = repo.get("doc-id", MySchema);
handle.doc        // TypedDoc
handle.loroDoc    // Raw LoroDoc
handle.subscribe(callback)
await handle.waitForSync()

// Mutate via standalone change()
change(handle.doc, draft => { /* ... */ })
```

## React Hooks

```tsx
import { RepoContext, useHandle, useDoc, useEphemeral } from "@loro-extended/react";

// useHandle -- stable, never re-renders
const handle = useHandle("doc-id", MySchema);

// useDoc -- reactive snapshot with selector
const title = useDoc(handle, d => d.meta.title);

// useEphemeral -- presence/transient state
const handle = useHandle("room", RoomSchema, EphemeralDeclarations);
const { self, peers } = useEphemeral(handle.presence);
```

## Deep Reference

- **[reference.md](./reference.md)** -- Full API reference (Shapes, TypedDoc, Repo, Handle, hooks, adapters, testing)
- **[patterns.md](./patterns.md)** -- Shipyard-specific patterns (schema structure, document wrappers, epoch reset, selectors, gotchas)

## Source Code

Local repo: `/Users/jacobpetterle/Working Directory/loro-extended/`

Key directories:
- `packages/change/src/` -- Shape, TypedDoc, change(), typed refs
- `packages/repo/src/` -- Repo, Handle, Synchronizer, adapters
- `packages/react/src/` -- React hooks
- `packages/hooks-core/src/` -- Framework-agnostic hook logic
- `adapters/` -- All storage and network adapters
- `examples/` -- Working example apps
