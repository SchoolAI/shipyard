# Package Structure Migration

**Created:** 2026-02-01
**Status:** In Progress
**Scope:** Restructure packages for Loro migration, extract signaling client, promote loro-schema

---

## Executive Summary

As part of the Yjs-to-Loro migration, we're restructuring our package architecture to:

1. **Extract `@shipyard/signaling`** - Move protocol schemas + client from `apps/signaling/src/client/` to a standalone package
2. **Promote `@shipyard/loro-schema`** - Graduate the spike at `spikes/loro-schema/` to `packages/loro-schema/`
3. **Deprecate `@shipyard/schema`** - Rename to `schema-legacy` (later removal)
4. **Keep `@shipyard/shared`** - Remains for non-CRDT utilities

This creates a clean separation: signaling handles transport/protocol, loro-schema handles data shapes, shared handles utilities.

---

## Current State

### packages/schema (LEGACY)

**Location:** `packages/schema/`
**Package:** `@shipyard/schema`

Contains Yjs-specific code that will be replaced:

```
packages/schema/
├── src/
│   ├── index.ts           # Barrel export
│   ├── plan.ts            # Plan types (will migrate to loro-schema)
│   ├── url-encoding.ts    # URL encoding (format agnostic, will migrate)
│   ├── yjs-helpers.ts     # Yjs helpers (2,133 lines - DELETE)
│   ├── yjs-keys.ts        # Yjs key constants (229 lines - DELETE)
│   ├── y-webrtc-internals.ts  # WebRTC internals (112 lines - DELETE)
│   └── claude-paths.ts    # Claude path utilities
└── package.json
```

**Exports:**
- `.` - Main entry
- `./plan` - Plan types
- `./url` - URL encoding
- `./yjs` - Yjs helpers
- `./claude-paths` - Claude paths

**Dependencies:**
- `@blocknote/core` - Will remove
- `yjs` - Will remove
- `lz-string`, `nanoid`, `zod` - Keep

### packages/shared (KEEP)

**Location:** `packages/shared/`
**Package:** `@shipyard/shared`

Non-CRDT utilities. No changes needed.

```
packages/shared/
├── src/
│   ├── index.ts
│   ├── registry-config.ts
│   └── instructions/
│       └── index.ts
└── package.json
```

**Exports:**
- `.` - Main entry
- `./registry-config` - Registry configuration
- `./instructions` - Agent instructions

### apps/signaling/src/client/ (EXTRACT)

**Location:** `apps/signaling/src/client/`
**Will become:** `@shipyard/signaling/client`

Currently embedded in the signaling app:

```
apps/signaling/src/client/
├── index.ts       # SignalingClient class (438 lines)
├── routes.ts      # Route constants (27 lines)
└── schemas.ts     # Zod schemas for all API (524 lines)
```

**Total:** ~990 lines of reusable client code

### spikes/loro-schema/ (PROMOTE)

**Location:** `spikes/loro-schema/`
**Will become:** `packages/loro-schema/`

Validated spike with complete Loro shape definitions:

```
spikes/loro-schema/
├── src/
│   ├── index.ts     # Barrel export
│   └── shapes.ts    # Loro Shape definitions (556 lines)
└── package.json
```

**Dependencies:**
- `loro-crdt` - Loro CRDT library
- `@loro-extended/change` - Schema-driven Loro wrapper
- `@loro-extended/repo` - Repository pattern
- `@loro-extended/react` - React hooks
- `nanoid`, `zod` - Utilities

---

## Target State

### Package Structure

```
packages/
├── shared/              # KEEP - Non-CRDT utilities
│   ├── src/
│   │   ├── index.ts
│   │   ├── registry-config.ts
│   │   └── instructions/
│   └── package.json
│
├── loro-schema/         # NEW - Loro shapes + validators
│   ├── src/
│   │   ├── index.ts         # Barrel export
│   │   ├── shapes.ts        # TaskDocumentSchema, GlobalRoomSchema
│   │   ├── types.ts         # Plan types (from old schema)
│   │   ├── url-encoding.ts  # URL encoding (from old schema)
│   │   └── helpers.ts       # Loro doc helpers (new)
│   └── package.json
│
├── signaling/           # NEW - Protocol schemas + client
│   ├── src/
│   │   ├── index.ts         # Protocol schemas + types
│   │   ├── schemas.ts       # Zod schemas (from apps/signaling/src/client/)
│   │   ├── routes.ts        # Route constants
│   │   ├── client/
│   │   │   └── index.ts     # SignalingClient class
│   │   └── types.ts         # Shared types
│   └── package.json
│
└── schema/              # LEGACY -> schema-legacy (later)
    └── (to be renamed/removed)
```

### @shipyard/signaling

**Exports:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./client": {
      "import": "./dist/client/index.mjs",
      "types": "./dist/client/index.d.mts"
    }
  }
}
```

**Usage:**
```typescript
// Server imports schemas and routes
import {
  HealthResponseSchema,
  PersonalRoomClientMessageSchema,
  ROUTES
} from '@shipyard/signaling';

// Client imports the client class
import { SignalingClient, createSignalingClient } from '@shipyard/signaling/client';
```

### @shipyard/loro-schema

**Exports:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./shapes": {
      "import": "./dist/shapes.mjs",
      "types": "./dist/shapes.d.mts"
    }
  }
}
```

**Usage:**
```typescript
// Import shapes for document creation
import { TaskDocumentSchema, GlobalRoomSchema } from '@shipyard/loro-schema/shapes';

// Import types for type-safe access
import type { TaskDocument, TaskMeta, TaskComment } from '@shipyard/loro-schema';
```

---

## Decision Rationale

### Why protocol + client together?

1. **Single source of truth** - Schemas define both server validation and client types
2. **Atomic versioning** - Protocol changes ship with client updates
3. **Reduced duplication** - No need to sync types between packages
4. **loro-extended pattern** - `@loro-extended/asks` bundles protocol + helpers

### Why not a separate types package?

1. **Types live where defined** - Schemas generate types via `z.infer<>`
2. **No orphan types** - Types without implementation are fragile
3. **Simpler dependency graph** - Fewer packages to maintain
4. **loro-extended pattern** - Types exported from same package as implementation

### Why subpath exports?

1. **Tree shaking** - Server doesn't bundle client code
2. **Clear boundaries** - `./client` is explicitly for consumers, not servers
3. **loro-extended pattern** - `@loro-extended/change` uses `./src/*` pattern
4. **pnpm workspace compatible** - Works with `workspace:^` references

### Why workspace:^ references?

1. **Local development** - Changes propagate without publishing
2. **Monorepo standard** - pnpm workspace protocol
3. **loro-extended pattern** - All loro-extended packages use `workspace:^`

---

## Consumer Mapping

### @shipyard/signaling

| Consumer | Usage |
|----------|-------|
| `apps/signaling` | Server - imports schemas for validation |
| `apps/web` | Browser - imports client for API calls |
| `apps/daemon` | Agent - imports client for registration |

### @shipyard/loro-schema

| Consumer | Usage |
|----------|-------|
| `apps/server` | MCP tools - imports shapes for doc creation |
| `apps/web` | UI - imports types for type-safe rendering |
| `apps/hook` | Hook - imports shapes for plan manipulation |

---

## loro-extended Patterns We're Adopting

### 1. Schema-Driven Types

From `@loro-extended/change`:
- Define shapes with `Shape.doc()`, `Shape.struct()`, `Shape.list()`, etc.
- Export inferred types: `type TaskDocument = Infer<typeof TaskDocumentSchema>`
- No separate type definitions - types flow from shapes

### 2. Base Field Extraction

From loro-extended examples (asks, quiz-challenge):
```typescript
const CommentBaseFields = {
  id: Shape.plain.string(),
  body: Shape.plain.string(),
  // ...
} as const;

// Spread into discriminated union variants
Shape.plain.discriminatedUnion('kind', {
  inline: Shape.plain.struct({
    kind: Shape.plain.string('inline'),
    ...CommentBaseFields,
    blockId: Shape.plain.string(),
  }),
});
```

### 3. Peer Dependencies

From `@loro-extended/asks`:
```json
{
  "peerDependencies": {
    "@loro-extended/change": "workspace:^",
    "loro-crdt": "^1.10.3"
  }
}
```

### 4. Source Exports for Development

From `@loro-extended/change`:
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./src": "./src/index.ts",
    "./src/*": "./src/*"
  }
}
```

---

## Migration Path

### Phase 1: Create @shipyard/signaling (Week 1)

1. Create `packages/signaling/` directory
2. Move files from `apps/signaling/src/client/`:
   - `schemas.ts` -> `packages/signaling/src/schemas.ts`
   - `routes.ts` -> `packages/signaling/src/routes.ts`
   - `index.ts` -> `packages/signaling/src/client/index.ts`
3. Create `packages/signaling/src/index.ts` barrel export
4. Configure `package.json` with subpath exports
5. Update `apps/signaling` to import from `@shipyard/signaling`
6. Add `@shipyard/signaling` to `apps/web`, `apps/daemon` dependencies

**Files to create:**
```
packages/signaling/
├── src/
│   ├── index.ts           # export * from './schemas'; export * from './routes';
│   ├── schemas.ts         # (from apps/signaling/src/client/schemas.ts)
│   ├── routes.ts          # (from apps/signaling/src/client/routes.ts)
│   └── client/
│       └── index.ts       # (from apps/signaling/src/client/index.ts)
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

### Phase 2: Promote @shipyard/loro-schema (Week 1)

1. Copy `spikes/loro-schema/` to `packages/loro-schema/`
2. Update `package.json`:
   - Change link dependencies to `workspace:^`
   - Add proper peer dependencies
3. Add subpath export for `./shapes`
4. Create `helpers.ts` for Loro doc utilities (empty initially)
5. Migrate `url-encoding.ts` from old schema
6. Migrate `plan.ts` types from old schema

**Files to create:**
```
packages/loro-schema/
├── src/
│   ├── index.ts           # Barrel + type exports
│   ├── shapes.ts          # (from spikes/loro-schema/src/shapes.ts)
│   ├── helpers.ts         # Loro doc helpers (new)
│   ├── types.ts           # Plan types (from packages/schema/src/plan.ts)
│   └── url-encoding.ts    # (from packages/schema/src/url-encoding.ts)
├── package.json
├── tsconfig.json
└── tsdown.config.ts
```

### Phase 3: Update Consumers (Week 2)

1. Update `apps/signaling`:
   - Remove `src/client/` directory
   - Import from `@shipyard/signaling` instead
2. Update `apps/web`:
   - Add `@shipyard/signaling` dependency
   - Import client from `@shipyard/signaling/client`
3. Update `apps/daemon`:
   - Add `@shipyard/signaling` dependency
   - Import client from `@shipyard/signaling/client`
4. Update `apps/server`:
   - Add `@shipyard/loro-schema` dependency
   - Migrate from `@shipyard/schema` imports

### Phase 4: Deprecate @shipyard/schema (Week 3+)

1. Rename `packages/schema` to `packages/schema-legacy`
2. Update package.json name to `@shipyard/schema-legacy`
3. Grep for remaining `@shipyard/schema` imports
4. Migrate remaining consumers
5. Delete `packages/schema-legacy` when no imports remain

---

## File Inventory

### Files Moving to @shipyard/signaling

| Source | Destination | Lines |
|--------|-------------|-------|
| `apps/signaling/src/client/index.ts` | `packages/signaling/src/client/index.ts` | 438 |
| `apps/signaling/src/client/routes.ts` | `packages/signaling/src/routes.ts` | 27 |
| `apps/signaling/src/client/schemas.ts` | `packages/signaling/src/schemas.ts` | 524 |

**Total:** ~990 lines

### Files Moving to @shipyard/loro-schema

| Source | Destination | Lines |
|--------|-------------|-------|
| `spikes/loro-schema/src/shapes.ts` | `packages/loro-schema/src/shapes.ts` | 556 |
| `spikes/loro-schema/src/index.ts` | `packages/loro-schema/src/index.ts` | ~20 |
| `packages/schema/src/url-encoding.ts` | `packages/loro-schema/src/url-encoding.ts` | ~200 |
| `packages/schema/src/plan.ts` | `packages/loro-schema/src/types.ts` | ~150 |

**Total:** ~930 lines

### Files to Delete (Eventually)

| File | Lines | Reason |
|------|-------|--------|
| `packages/schema/src/yjs-helpers.ts` | 2,133 | Yjs-specific |
| `packages/schema/src/yjs-keys.ts` | 229 | Yjs-specific |
| `packages/schema/src/y-webrtc-internals.ts` | 112 | Yjs-specific |

**Total deletion:** ~2,474 lines

---

## Package.json Templates

### packages/signaling/package.json

```json
{
  "name": "@shipyard/signaling",
  "version": "0.1.0",
  "type": "module",
  "description": "Signaling protocol schemas and client for Shipyard",
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./client": {
      "import": "./dist/client/index.mjs",
      "types": "./dist/client/index.d.mts"
    }
  },
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "lint:fix": "biome check src --write"
  },
  "dependencies": {
    "zod": "^4.3.5"
  },
  "devDependencies": {
    "@types/node": "^25.0.10",
    "tsdown": "0.20.0-beta.4",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

### packages/loro-schema/package.json

```json
{
  "name": "@shipyard/loro-schema",
  "version": "0.1.0",
  "type": "module",
  "description": "Loro-based schema and CRDT helpers for Shipyard",
  "main": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.mts"
    },
    "./shapes": {
      "import": "./dist/shapes.mjs",
      "types": "./dist/shapes.d.mts"
    }
  },
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "lint:fix": "biome check src --write"
  },
  "dependencies": {
    "lz-string": "^1.5.0",
    "nanoid": "^5.1.6",
    "zod": "^4.3.5"
  },
  "peerDependencies": {
    "@loro-extended/change": "workspace:^",
    "loro-crdt": "^1.10.3"
  },
  "devDependencies": {
    "@loro-extended/change": "workspace:^",
    "@types/node": "^25.0.10",
    "loro-crdt": "^1.10.3",
    "tsdown": "0.20.0-beta.4",
    "typescript": "^5.9.3",
    "vitest": "^4.0.17"
  }
}
```

---

## Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| Should `./client` export the schemas too? | Pending | Currently client imports from parent |
| Do we need `./protocol` subpath? | No | Keep simple - one subpath is enough |
| Include WebSocket helpers in signaling client? | Pending | May add `createPersonalRoomConnection()` later |
| loro-extended as workspace or npm? | Workspace | Using `link:` currently, will formalize |

---

## Success Criteria

- [ ] `@shipyard/signaling` builds and exports schemas + client
- [ ] `@shipyard/loro-schema` builds and exports shapes + types
- [ ] `apps/signaling` imports from `@shipyard/signaling`
- [ ] `apps/web` imports client from `@shipyard/signaling/client`
- [ ] No `apps/signaling/src/client/` directory remains
- [ ] No `spikes/loro-schema/` directory remains
- [ ] All tests pass
- [ ] TypeScript compilation succeeds

---

*Last updated: 2026-02-01*
