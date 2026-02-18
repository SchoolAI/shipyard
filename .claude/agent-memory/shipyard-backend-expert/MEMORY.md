# Shipyard Backend Expert Memory

## loro-prosemirror Container Structure
- Root container: `LoroMap` with keys `nodeName` (string), `attributes` (LoroMap), `children` (LoroList)
- Constants: `NODE_NAME_KEY = "nodeName"`, `ATTRIBUTES_KEY = "attributes"`, `CHILDREN_KEY = "children"`
- Children are either `LoroMap` (element nodes) or `LoroText` (text nodes)
- Default root: `doc.getMap("doc")`, or custom via `containerId` (a `ContainerID`)
- Text marks: stored as delta attributes on LoroText via `applyDelta()`, NOT as separate containers
- Helper: `getOrCreateContainer(key, new LoroMap())` creates if missing
- See: `node_modules/.pnpm/loro-prosemirror@*/node_modules/loro-prosemirror/src/lib.ts`
- See: [patterns.md](./patterns.md) for details

## Daemon Patterns
- `@shipyard/loro-schema` must be built before daemon typecheck works (workspace dep)
- Biome rules: no non-null assertions (use guard + throw), no string concat (use template literals), cognitive complexity max 15
- `verbatimModuleSyntax` in tsconfig: use `import type` for type-only, regular import for value usage
- loro-crdt `insertContainer().getAttached()` can return undefined; use guard + throw pattern
- `marked.lexer()` works server-side without DOM (unlike `@tiptap/core` `generateJSON` which needs DOMParser)
