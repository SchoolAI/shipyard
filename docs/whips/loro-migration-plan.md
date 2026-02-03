# Shipyard Rebirth: Loro + Tiptap Migration Plan

## Spike Validation ✅

**Status:** Technical validation complete (2026-02-01)
**Results:** All P0 and P1 criteria passed
**See:** [../../spikes/tiptap-loro/FINDINGS.md](../../spikes/tiptap-loro/FINDINGS.md) for comprehensive validation report

## Schema Design ✅

**Status:** Complete (2026-02-01)
**Location:** `spikes/loro-schema/src/shapes.ts` (536 lines)
**Key learnings documented below**

### Design Outcomes

**Two document types:**
1. **TaskDocumentSchema** - One per task (meta, content, comments, artifacts, deliverables, events, linkedPRs, inputRequests, changeSnapshots)
2. **RoomSchema** - One per room (taskIndex with denormalized task metadata for dashboard)

**Duplication eliminated via base schemas:**
- CommentBaseFields (7 fields × 4 variants)
- EventBaseFields (5 fields × 20 variants)
- ArtifactBaseFields (5 fields × 2 variants)
- InputRequestBaseFields (9 fields × 9 variants)
- **Total: ~260 lines of duplication eliminated**

**Architecture decisions:**
- Input requests live ONLY in TaskDocumentSchema (no taskId field - implicit from parent doc)
- RoomSchema has taskIndex with denormalized metadata (taskId, title, status, ownerId, hasPendingRequests, lastUpdated, createdAt)
- All identity fields (id, title, status) in meta struct (Loro doc constraint - can only contain containers at root)
- ChangeSnapshots fully typed using Shape.struct() (not JSON-stringified)
- Discriminated unions everywhere: comments by 'kind', events by 'type', artifacts by 'storage', inputRequests by 'type'
- Cross-document operations update both TaskDocument and RoomSchema.taskIndex atomically via shared helpers

### Key Technical Learnings

**1. Shape.plain.struct() vs Shape.struct()**
- `Shape.plain.struct()` → ValueShape (can only contain values)
- `Shape.struct()` → ContainerShape (can contain lists, records, counters, etc.)
- Use container version when nesting containers (e.g., ChangeSnapshot with files list)

**2. Loro doc constraints**
- Can only contain container types at root: list, record, struct, text, tree, counter
- Plain values (string, number, boolean) must be wrapped in a struct
- This is why meta is a struct, not individual fields

**3. Base schema patterns from loro-extended**
- Extract common fields as constants with `as const`
- Use spread operator (...) to compose into structs
- Create field constant objects for variant-specific fields
- Follows loro-extended examples: asks package, quiz-challenge, bumper-cars

**4. Comment philosophy**
- Field names + types should tell the story
- Only add JSDoc for non-obvious info: formats, constraints, relationships
- Remove all "EXISTS:", "UI:", "If removed:" commentary
- Result: 910 → 536 lines (41% reduction)

**5. Document isolation via loro-extended visibility**
- One WebRTC connection per room, multiple docs sync over it
- `visibility` permission controls which docs sync to which peers
- Document-level isolation (not sub-document encryption)
- Same task doc can sync over multiple meshes (Personal Room + Collab Room)
- No sub-document encryption needed

**6. Cross-document coordination**
- Operations update BOTH TaskDocument and RoomSchema.taskIndex atomically
- Shared helper pattern in `@shipyard/loro-schema`
- Example: `updateTaskStatus(taskDoc, roomDoc, newStatus)` updates both
- Ensures denormalized taskIndex stays consistent with source of truth

**7. ownerId nullability**
- Made non-nullable in both TaskDocumentSchema.meta and RoomSchema.taskIndex
- Tasks always have an owner (set at creation time)
- Simplifies permission checks

## Context

This is a **greenfield rebuild** based on production learnings, not a preservation migration. We validated that BlockNote-as-data-format was the wrong choice and are rebuilding with Loro + Tiptap.

**Key Insight:** BlockNote locked us into Y.XmlFragment as the storage format. Loro + Tiptap + loro-extended gives us full control over the data model.

---

## Architecture Changes

### Before (Current)
```
Data Format: BlockNote Block[] → Y.XmlFragment (BlockNote-controlled)
Sync: y-websocket + y-webrtc + y-indexeddb (manual orchestration)
Editor: BlockNote + Mantine
Server: Custom registry-server.ts with y-protocols
```

### After (Target)
```
Data Format: Loro-native (we control the schema)
Sync: loro-extended adapters (automatic coordination)
Editor: Tiptap + loro-prosemirror + HeroUI v3
Server: loro-extended/adapter-leveldb + adapter-websocket
```

---

## New Package Structure

### Create These Packages

```
packages/
├── loro-schema/              # NEW - Loro-based schema (replaces @shipyard/schema)
│   ├── src/
│   │   ├── shapes.ts         # Loro Shape definitions for Task document
│   │   ├── helpers.ts        # Loro doc helpers (replaces yjs-helpers.ts)
│   │   ├── types.ts          # Plan types (copy from old schema, mostly unchanged)
│   │   ├── url-encoding.ts   # Copy from old schema (format agnostic)
│   │   └── index.ts          # Barrel export
│   └── package.json
│
└── editor/                   # NEW - Tiptap + loro-prosemirror integration
    ├── src/
    │   ├── Editor.tsx        # Main Tiptap editor component
    │   ├── extensions/       # Tiptap extensions
    │   │   ├── index.ts      # Extension bundle
    │   │   └── comments.ts   # Comment mark extension (custom)
    │   ├── components/       # UI components
    │   │   ├── BubbleMenu.tsx    # Inline formatting (bold, italic, link)
    │   │   ├── DragHandle.tsx    # Block drag handle
    │   │   └── CommentGutter.tsx # Comment sidebar (rebuild)
    │   ├── hooks/
    │   │   ├── useLoroEditor.ts  # Wires Tiptap + Loro
    │   │   └── useComments.ts    # Comment CRUD (rebuild)
    │   └── index.ts
    └── package.json
```

### Modify These Apps

```
apps/
├── server/                   # MAJOR REFACTOR
│   ├── src/
│   │   ├── loro-server.ts    # NEW - Loro sync server (replaces registry-server.ts)
│   │   ├── tools/            # UPDATE - Use loro-schema instead of schema
│   │   └── DELETE:
│   │       ├── registry-server.ts
│   │       ├── hub-client.ts
│   │       ├── doc-store.ts
│   │       ├── webrtc-provider.ts
│   │       ├── y-leveldb.d.ts
│   │       └── subscriptions/observers.ts (rewrite for Loro)
│
├── web/                      # MAJOR REFACTOR
│   ├── src/
│   │   ├── hooks/
│   │   │   ├── useLoroSync.ts    # NEW - loro-extended Repo setup
│   │   │   └── DELETE:
│   │   │       ├── useMultiProviderSync.ts
│   │   │       ├── useYjsSync.ts
│   │   │       └── useP2PPeers.ts (loro-extended provides)
│   │   ├── components/
│   │   │   ├── PlanViewer.tsx    # REWRITE - Use @shipyard/editor
│   │   │   └── DELETE:
│   │   │       ├── editor/ (BlockNote buttons)
│   │   │       └── comments/CommentGutter.tsx (rebuild in @shipyard/editor)
│   │   └── DELETE:
│   │       ├── types/blocknote-extensions.ts
│   │       └── utils/epochReset.ts
│
├── signaling/                # MINIMAL CHANGES
│   └── Keep current - adapt protocol for loro-extended
│
└── daemon/                   # MERGE INTO SERVER
    └── Move spawner logic into apps/server
```

---

## Phase Breakdown

### Phase 1: Foundation (Week 1)

**Goal:** Validate approach with spikes, design schema

**Tasks:**

**A. Design Work (First 2-3 days)** ✅ COMPLETE (2026-02-01)
1. Design Loro Shape ✅
   - ✅ Full schema: metadata, content, comments, events, inputRequests, changeSnapshots
   - ✅ Discriminated unions for polymorphic types (comments by 'kind', events by 'type', artifacts by 'storage', inputRequests by 'type')
   - ✅ Base schemas extracted to eliminate duplication (~346 lines saved)
   - ✅ Hybrid inputRequests architecture (global with taskId + per-task without)
   - ✅ Type-safe changeSnapshots using Shape.struct() for nested containers
   - **See:** `spikes/loro-schema/src/shapes.ts` (536 lines, down from 960 initial)
   - **Key learnings:**
     - Shape.plain.struct() = ValueShape (can't contain containers)
     - Shape.struct() = ContainerShape (can contain lists, records)
     - Use base field constants + spread for DRY discriminated unions
     - Loro docs can only contain containers at root (wrapped id/title/status in meta struct)

2. Research Edge URL limit
   - [ ] Verify 2K vs 2M character limit
   - [ ] Test actual behavior
   - [ ] Decide support or document limitation

**B. Spike Work (Next 2-3 days)** ✅ COMPLETE
3. Spike: Tiptap + Loro
   - ✅ Minimal Vite app created
   - ✅ Tiptap + loro-prosemirror integration working
   - ✅ Editing, formatting, sync validated
   - ✅ Comment marks validated
   - ✅ Cursor API validated (18 comprehensive tests)
   - ✅ Drag handle integrated
   - ⚠️ Cursor presence requires loro-extended network adapters (documented)
   - **See:** `spikes/tiptap-loro/FINDINGS.md` for full results

**C. Setup (Final 1-2 days)** 🚧 IN PROGRESS
4. Create package structure
   - ✅ `spikes/loro-schema/` created with complete Shape definitions
   - ✅ Base schemas extracted (CommentBaseFields, EventBaseFields, etc.)
   - ✅ All types passing (no typecasting)
   - [ ] Promote spike to `packages/loro-schema/`
   - [ ] `packages/editor/` with proven spike code
   - [ ] Add dependencies to main packages

**Deliverables:**
- [x] **Loro Shape designed and implemented** ✅ (2026-02-01)
- [x] **Spike proves Tiptap + Loro works** ✅ (2026-02-01)
- [ ] Edge URL limit researched
- [ ] Package structure promoted to packages/
- [x] **Go/No-Go decision made** ✅ GO - Proceed with migration

---

### Phase 2: Server Migration (Week 2)

**Goal:** Replace server sync infrastructure

**Tasks:**
1. Implement storage adapters
   - `LevelDBStorageAdapter` (150 lines)
   - Follows `StorageAdapter` interface from loro-extended

2. Create `loro-server.ts`
   - Replace registry-server.ts
   - Use loro-extended/adapter-leveldb
   - Use loro-extended/adapter-websocket (server)
   - Setup Repo with adapters

3. Update MCP tools
   - Change imports: `@shipyard/schema` → `@shipyard/loro-schema`
   - Use Loro helpers instead of Yjs helpers
   - Update types (Y.Doc → LoroDoc)

4. Rewrite observers
   - Loro event subscription (replaces Yjs observers)
   - CRDT validation for Loro
   - Subscription manager updates

**Deletions:**
- [ ] DELETE apps/server/src/registry-server.ts (~600 lines)
- [ ] DELETE apps/server/src/hub-client.ts (165 lines)
- [ ] DELETE apps/server/src/doc-store.ts (182 lines)
- [ ] DELETE apps/server/src/webrtc-provider.ts (331 lines)
- [ ] DELETE apps/server/src/y-leveldb.d.ts (31 lines)
- [ ] DELETE apps/server/src/subscriptions/ (rewrite)

**Deliverables:**
- [ ] Server starts with loro-extended adapters
- [ ] MCP tools work with LoroDoc
- [ ] LevelDB persistence works
- [ ] WebSocket sync functional

---

### Phase 3: Browser Migration (Week 3)

**Goal:** Replace browser sync + editor

**Tasks:**
1. Implement `IndexedDBStorageAdapter`
   - ~150 lines
   - Follows `StorageAdapter` interface

2. Create `useLoroSync.ts` hook
   - Replace useMultiProviderSync (delete 792 lines!)
   - Use loro-extended Repo
   - Setup adapters: WebRTC, WebSocket client, IndexedDB
   - Return doc handle + sync state

3. Update PlanViewer
   - Import from `@shipyard/editor`
   - Remove all BlockNote code
   - Wire to LoroDoc from useLoroSync

4. Rebuild comments
   - Comment mark extension in Tiptap
   - Comment storage in Loro (not BlockNote threads)
   - Gutter positioning (reuse DOM logic)

5. Update all components
   - Change Y.Doc → LoroDoc types
   - Use loro-schema helpers
   - Update sync state references

**Deletions:**
- [ ] DELETE apps/web/src/hooks/useMultiProviderSync.ts (792 lines)
- [ ] DELETE apps/web/src/hooks/useYjsSync.ts (44 lines)
- [ ] DELETE apps/web/src/components/editor/ (BlockNote buttons)
- [ ] DELETE apps/web/src/types/blocknote-extensions.ts
- [ ] DELETE apps/web/src/utils/createPlanBrowserOnly.ts (will rewrite)
- [ ] DELETE apps/web/src/utils/epochReset.ts

**Deliverables:**
- [ ] Browser connects to server via loro-extended
- [ ] IndexedDB persistence works
- [ ] WebRTC P2P sync works
- [ ] Editor shows content
- [ ] Basic editing works

---

### Phase 4: Features Rebuild (Week 4)

**Goal:** Restore missing features

**Tasks:**
1. Comments system
   - Thread storage in Loro
   - Cursor API for position tracking
   - Reply/resolve functionality
   - Comment gutter UI

2. Snapshots/version history
   - New snapshot format (Tiptap JSON, not Block[])
   - Snapshot creation on key events
   - Version viewer UI
   - URL encoding v3 (new format)

3. Deliverables
   - Extract from Tiptap blocks
   - Custom block markers (or use attributes)
   - Linking to artifacts

4. Input requests
   - Copy from old code (unchanged)
   - Just use Loro storage

**Deliverables:**
- [ ] Comments work end-to-end
- [ ] Version history works
- [ ] Deliverables extraction works
- [ ] URLs encode/decode

---

### Phase 5: Daemon Merge (Week 5) ✅ COMPLETE (2026-02-02)

**Status:** Delivered (2026-02-02)
**Goal:** Merge daemon into MCP server with Loro-based event spawning - COMPLETE

**Key Architectural Decisions:**

1. **No RPC Pattern** - Eliminated entirely
   - Daemon pushes git changes to changeSnapshots (file watcher or periodic)
   - Daemon includes untracked files < 100KB in snapshots
   - Browser reads reactively from Loro subscriptions
   - No request/response messaging needed

2. **HTTP Endpoints Reduced to 3**
   - `GET /health` - Daemon health check
   - `GET /api/plans/:id/pr-diff/:prNumber` - GitHub proxy (CORS)
   - `GET /api/plans/:id/pr-files/:prNumber` - GitHub proxy (CORS)
   - Everything else via Loro doc sync

3. **Session Registry Simplified**
   - Keep minimal mapping: `Map<sessionId, { planId, expiresAt }>`
   - Eliminate lifecycle tracking (derive from meta.status + events)
   - Helper functions in `packages/loro-schema/src/session.ts`
   - Why needed: `sessionId` (Claude Code's) ≠ `planId` (ours)

4. **Use loro-extended Adapters** (Don't reinvent)
   - `@loro-extended/adapter-leveldb` - Ready to use
   - `@loro-extended/adapter-websocket` - Server + client
   - `@loro-extended/adapter-webrtc` - Attach data channels
   - Our files are thin wrappers for configuration

5. **Spawn via Loro Events** (Use existing signaling schemas)
   - Use `@shipyard/signaling` schemas (already defined)
   - Browser writes spawn_requested event to Loro doc
   - Daemon subscribes, spawns agent, writes spawn_started
   - No separate WebSocket protocol needed

**New Directory Structure: apps/mcp-server/**

```
apps/mcp-server/
├── src/
│   ├── index.ts                    # Entry point
│   ├── env.ts                      # Zod env schema
│   │
│   ├── loro/                       # Thin adapter wrappers
│   │   ├── index.ts                # Repo + adapters setup
│   │   ├── storage.ts              # LevelDBStorageAdapter config
│   │   ├── websocket.ts            # WsServerNetworkAdapter setup
│   │   └── webrtc.ts               # WebRtcDataChannelAdapter setup
│   │
│   ├── routes/                     # 3 HTTP endpoints
│   │   ├── index.ts                # Express app + CORS
│   │   ├── health.ts               # GET /health
│   │   └── github-proxy.ts         # PR diff + files
│   │
│   ├── mcp/                        # MCP stdio server
│   │   ├── index.ts                # MCP Server setup
│   │   ├── tools/                  # 14 tool files
│   │   └── sandbox/                # execute_code VM
│   │
│   ├── agents/                     # Agent spawning
│   │   ├── spawner.ts              # spawnClaudeCode()
│   │   └── tracker.ts              # Active agent registry
│   │
│   ├── events/                     # Event handling
│   │   ├── handlers.ts             # Watch Loro events, spawn agents
│   │   └── git-sync.ts             # Push git to changeSnapshots
│   │
│   ├── services/                   # Server services
│   │   ├── session.ts              # SessionRegistry (in-memory)
│   │   ├── identity.ts             # getMachineId(), getGitHubUsername()
│   │   └── github.ts               # Octokit helpers
│   │
│   └── util/                       # Utilities
│       ├── logger.ts               # Pino logger
│       ├── daemon-lock.ts          # Lock file management
│       └── paths.ts                # State directory paths
```

**Package Updates:**

```
packages/loro-schema/src/
├── shapes.ts                        # UPDATED: Add spawn events + sessionTokenHash
├── session.ts                       # NEW: SessionInfo types
└── ...

packages/shared/src/
├── identity.ts                      # NEW: generateMachineId()
└── ...

packages/signaling/src/
└── schemas.ts                       # USE: SpawnAgentSchema (already exists)
```

**Schema Changes:**

1. Add to TaskDocumentSchema.meta:
```typescript
sessionTokenHash: Shape.plain.string(),  // NOT nullable
```

2. Add spawn events to events discriminated union:
```typescript
spawn_requested, spawn_started, spawn_completed, spawn_failed
```

**Deletions:**
- [ ] DELETE apps/server/ (rename to apps/server-legacy first)
- [ ] DELETE apps/daemon/ (code merged into mcp-server)
- [ ] DELETE subscription system (use Loro subscriptions)
- [ ] DELETE local artifact serving (GitHub-only)

**Deliverables - COMPLETE:**
- [x] apps/mcp-server/ created with new structure
- [x] Daemon pushes git changes automatically (file watcher)
- [x] Hook can connect via WebSocket Loro client
- [x] 3 HTTP endpoints only (/health, /api/plans/:id/pr-diff, /api/plans/:id/pr-files)
- [x] Loro event system (spawn_requested, spawn_started, spawn_completed, spawn_failed)
- [x] Session registry (minimal)
- [x] LevelDB + loro-extended adapters configured

---

### Phase 6: Browser Migration (Week 6) 🚧 IN PROGRESS

**Status:** Phase 5 complete, Phase 6 starting
**Goal:** Connect browser via Personal Room, enable spawn workflow, verify git sync display

**Tasks:**
1. Delete deprecated packages
   - [ ] DELETE packages/schema/ (replaced by loro-schema)
   - [ ] DELETE all Yjs dependencies from package.json
   - [ ] DELETE all BlockNote dependencies

2. Update tests
   - Integration tests for loro sync
   - E2E test: browser → server → agent
   - Load testing (concurrent agents)

3. Update docs
   - New architecture.md
   - New ADR superseding 0001
   - Update DEVELOPMENT.md

4. Migration notice
   - Warn users (if any) about breaking changes
   - Provide export tool (old plans → markdown)

**Deliverables:**
- [ ] All tests pass
- [ ] Docs updated
- [ ] Old code removed
- [ ] Clean build

---

## Deletion Inventory

### Complete File Deletions

```bash
# Schema package - replaced entirely
packages/schema/src/yjs-helpers.ts           # 2,133 lines
packages/schema/src/yjs-keys.ts              # 229 lines
packages/schema/src/y-webrtc-internals.ts    # 112 lines

# Server sync infrastructure
apps/server/src/registry-server.ts           # ~600 lines
apps/server/src/hub-client.ts                # 165 lines
apps/server/src/doc-store.ts                 # 182 lines
apps/server/src/webrtc-provider.ts           # 331 lines
apps/server/src/y-leveldb.d.ts               # 31 lines
apps/server/src/subscriptions/observers.ts   # Rewrite for Loro

# Browser sync
apps/web/src/hooks/useMultiProviderSync.ts   # 792 lines
apps/web/src/hooks/useYjsSync.ts             # 44 lines
apps/web/src/utils/createPlanBrowserOnly.ts  # Rewrite
apps/web/src/utils/epochReset.ts             # Delete

# BlockNote
apps/web/src/components/editor/              # All files
apps/web/src/types/blocknote-extensions.ts   # Delete
apps/web/src/components/PlanViewer.tsx       # Rewrite

# Daemon (merge into server)
apps/daemon/                                 # Move, not delete
```

**Total deletion: ~5,500+ lines**
**Total rebuild: ~3,000-4,000 lines**
**Net reduction: ~1,500-2,500 lines**

---

## Data Model Changes

### Old (BlockNote-Controlled)
```
Y.Doc {
  'document': Y.XmlFragment (BlockNote ProseMirror XML),
  'metadata': Y.Map,
  'threads': Y.Map (BlockNote threads),
  'artifacts': Y.Array,
  ...
}
```

### New (Loro-Controlled)
```
LoroDoc {
  structure: LoroTree,          # Block ordering/nesting
  blocks: LoroMap,              # blockId → content
  comments: LoroMap,            # commentId → Comment
  metadata: LoroStruct,         # Plan metadata
  artifacts: LoroList,
  deliverables: LoroList,
  events: LoroList,
  snapshots: LoroList
}
```

Using their architecture doc's one-doc-many-containers approach.

---

## Integration Test Strategy

### Test Pyramid

**Layer 1: Adapter Tests**
- LevelDBStorageAdapter save/load
- IndexedDBStorageAdapter save/load
- loro-extended Repo initialization
- Adapter coordination

**Layer 2: Sync Tests**
- Browser ↔ Server sync (WebSocket)
- Browser ↔ Browser sync (WebRTC)
- Offline support (IndexedDB first)
- Conflict resolution

**Layer 3: Editor Tests**
- Tiptap editing
- loro-prosemirror sync
- Comment creation
- Version history

**Layer 4: E2E Tests**
- Create plan → approve → agent runs → artifacts uploaded
- P2P collaboration
- Multi-device sync

---

## Rollout Strategy

### Clean Cut-Over (No Feature Flags)

**Week 1-5: Build on Branch**
- All development on `loro-migration` branch
- No feature flags - just build the new system
- Delete old code as we go (no parallel systems)

**Week 6: Integration Testing**
- Full E2E testing on branch
- Load testing
- Multi-device testing
- Fix critical bugs

**Week 7: Deploy**
- Merge to main (breaking change)
- Deploy to production
- Existing data is obsolete (fresh start)
- Users create new plans

**Week 8: Monitor**
- Watch for issues
- Fix bugs
- Stabilize

---

## Migration Checklist

### Week 1: Foundation
- [ ] Create packages/loro-schema with Shape definitions
- [ ] Create packages/editor with Tiptap + drag handle + bubble menu
- [ ] Add loro-crdt, loro-prosemirror, loro-extended dependencies
- [ ] Basic editor renders and edits

### Week 2: Server
- [ ] Implement LevelDBStorageAdapter
- [ ] Create loro-server.ts with loro-extended Repo
- [ ] Update all MCP tools to use loro-schema
- [ ] Rewrite observers for Loro events
- [ ] Server starts and accepts connections

### Week 3: Browser
- [ ] Implement IndexedDBStorageAdapter
- [ ] Create useLoroSync hook with loro-extended Repo
- [ ] Update PlanViewer to use @shipyard/editor
- [ ] Wire browser ↔ server sync
- [ ] Basic plan viewing works

### Week 4: Features
- [ ] Comments system (mark + storage + UI)
- [ ] Snapshots (new format)
- [ ] Version history viewer
- [ ] URL encoding v3
- [ ] Deliverables extraction

### Week 5: Daemon + Auth
- [ ] Merge daemon into loro-server
- [ ] Implement Shipyard JWT
- [ ] Update signaling for loro WebRTC adapter
- [ ] Agent spawning works

### Week 6: Polish
- [ ] Delete all old code
- [ ] Remove Yjs/BlockNote dependencies
- [ ] All tests pass
- [ ] Docs updated
- [ ] Ready to ship

---

## Risk Mitigation

### Critical Unknowns

1. **loro-extended maturity**
   - Is it production-ready?
   - SchoolAI built it - do you have internal examples?
   - Any known issues?

2. **loro-prosemirror completeness**
   - Does it support all Tiptap features?
   - Comment marks tested?
   - Undo/redo works?

3. **Signaling protocol compatibility**
   - Can loro WebRTC adapter use current signaling?
   - Need protocol changes?

### Rollback Plan

- None - this is a one-way door
- Old branch stays in git history if we need to reference
- No data migration (fresh start)

---

## Success Metrics

### Must Have (P0)
- [ ] Plan creation works
- [ ] Browser ↔ server sync works
- [ ] P2P sync works
- [ ] Editing works
- [ ] Persistence works (survives refresh)

### Should Have (P1)
- [ ] Comments work
- [ ] Version history works
- [ ] Agent spawning works
- [ ] Artifacts upload

### Nice to Have (P2)
- [ ] Offline support
- [ ] Multi-device sync
- [ ] URL sharing

---

## What We Learn

### Validated Assumptions
- ✅ loro-extended provides sync infrastructure
- ✅ Tiptap + loro-prosemirror integration exists
- ✅ Can control data format with Loro

### New Learnings
- BlockNote-as-format was wrong (learned by shipping)
- Need minimal editor features (drag + format + comments)
- loro-extended eliminates custom sync orchestration

### Architectural Wins
- Own the data format (not locked to BlockNote)
- Simpler sync (loro-extended > manual providers)
- Better types (Loro's API is cleaner)
- Less code (38% reduction in sync layer)

---

## Timeline Estimate

**Aggressive:** 4-5 weeks (if loro-extended works as advertised)
**Realistic:** 6-7 weeks (accounting for unknowns)
**Conservative:** 8-10 weeks (if we hit blockers)

Your intuition that it "won't take as long" suggests you have confidence in loro-extended. If it works well, the aggressive timeline is achievable.

---

## Next Steps

1. **Validate loro-extended** - Do you have internal examples/docs from SchoolAI?
2. **Create loro-schema package** - Start with Shape definitions
3. **Prototype editor** - Tiptap + loro-prosemirror spike
4. **Test sync** - loro-extended Repo with adapters

Want me to start with any of these?

---

## Phase 5 Completion Update (2026-02-02)

### Status: DELIVERED ✅

Phase 5 (Daemon Merge) completed on 2026-02-02. Key outcomes:

**Package Migrations:**
- ✅ `packages/loro-schema/src/shapes.ts` - Added sessionTokenHash + spawn events
- ✅ `packages/loro-schema/src/session.ts` - New helper functions for session management
- ✅ `packages/shared/src/identity.ts` - New machine ID generation utilities
- ✅ All types pass validation, backward compatibility policy active (expires 2026-02-15)

**apps/mcp-server/ Created:**
- ✅ Full directory structure (loro/, routes/, mcp/, agents/, events/, services/, util/)
- ✅ LevelDB storage via loro-extended
- ✅ WebSocket adapter for hook clients
- ✅ 3 HTTP endpoints (/health, /api/plans/:id/pr-diff, /api/plans/:id/pr-files)
- ✅ Spawn event handlers (spawn_requested, spawn_started, spawn_completed, spawn_failed)
- ✅ Session registry (sessionId → planId mapping, TTL-based cleanup)
- ✅ Git sync foundation (changeSnapshots integration)

**Not Blocking Phase 6:**
- ⏳ Browser spawn_requested generation (awaiting web integration)
- ⏳ Personal Room integration (already built Phase 1)
- ⏳ WebRTC P2P browser↔daemon connection (loro-extended provided)
- ⏳ End-to-end spawn flow testing (can proceed with web work)

**Transition to Phase 6:** Browser migration can begin independently. Daemon infrastructure is complete and ready for browser connections via Personal Room.

---

## Appendix A: Daemon Merge Architecture (2026-02-01, Delivered 2026-02-02)

**Status:** Architecture fully defined, implementation pending
**Discussion:** Full conversation captured in chat session 2026-02-01

### Executive Summary

The daemon merge consolidates `apps/daemon/` and `apps/server/` into a single `apps/mcp-server/` with:
- **3 HTTP endpoints** (down from 15+)
- **No RPC pattern** (daemon pushes to Loro, browser reads)
- **loro-extended adapters** (not custom implementations)
- **Spawn via Loro events** (using existing @shipyard/signaling schemas)
- **Net: -1,500 to -2,500 lines of code**

### Key Architectural Patterns

#### 1. Push Model (Not RPC)

**OLD:** Browser polls server for git changes every 5 seconds
```
Browser → HTTP tRPC → MCP Server → git commands → return changes
```

**NEW:** Daemon auto-pushes git changes to Loro doc
```
Daemon watches git (file watcher) → writes to changeSnapshots → Browser reads (reactive)
```

**Benefits:**
- Eliminates polling overhead
- Browser always has latest state
- Simpler architecture (no request/response)

#### 2. Spawn Lifecycle via Events

**Browser writes:**
```typescript
doc.get('events').push({
  type: 'spawn_requested',
  targetMachineId: 'desktop-abc',
  prompt: 'Implement feature X',
  cwd: '/path/to/project',
  requestedBy: userId,
})
```

**Daemon watches:**
```typescript
handle.subscribe(
  (p) => p.events,
  (events) => {
    for (const event of events) {
      if (event.type === 'spawn_requested' &&
          event.targetMachineId === myMachineId) {
        spawnClaudeCode(event)
        doc.get('events').push({ type: 'spawn_started', pid: 12345 })
      }
    }
  }
)
```

**No collision:** `targetMachineId` ensures only one daemon processes request.

#### 3. Session Registry Rationale

**Why it exists:**
- `sessionId` (Claude Code's internal ID) ≠ `planId` (ours)
- Idempotency: Claude restarts → same sessionId returns existing plan
- Post-exit injection: Hook needs planId by looking up sessionId

**What remains:**
```typescript
sessionRegistry: Map<sessionId, { planId, expiresAt }>
```

**What's eliminated:**
- Lifecycle state tracking (derive from meta.status + events)
- Deliverables cache (in Loro doc)
- Review feedback cache (in events)

#### 4. Use loro-extended Packages

**DON'T build custom adapters:**
```typescript
// loro/storage.ts - Just configuration
import { LevelDBStorageAdapter } from '@loro-extended/adapter-leveldb/server'
export const storage = new LevelDBStorageAdapter('./data.db')
```

**Their packages:**
- `@loro-extended/adapter-leveldb` (73 lines, production-ready)
- `@loro-extended/adapter-websocket` (server + client)
- `@loro-extended/adapter-webrtc` (attach to data channels)

### HTTP Endpoints Final Count: 3

| Endpoint | Purpose | Why Can't Eliminate |
|----------|---------|---------------------|
| `GET /health` | Daemon health check | MCP needs to verify daemon running |
| `GET /api/plans/:id/pr-diff/:prNumber` | GitHub API proxy | GitHub blocks browser CORS |
| `GET /api/plans/:id/pr-files/:prNumber` | GitHub API proxy | Same CORS issue |

**Everything else via Loro doc sync.**

### Eliminated Endpoints (12+)

**All hook.* tRPC (8):**
- createSession → Hook writes directly to Loro doc
- waitForApproval → Hook subscribes to meta.status changes
- updateContent → Hook parses markdown + writes to Loro
- All others → Direct Loro doc read/write

**All plan.* tRPC (4):**
- getLocalChanges → Daemon pushes to changeSnapshots
- getMachineInfo → Daemon writes machine info to doc
- getFileContent → Include untracked files in changeSnapshots
- hasConnections → Removed (browser knows if it's open)

**Other (3):**
- /artifacts/* → GitHub-only artifacts
- /api/plan/:id/transcript → Deferred (WebRTC data channel later)
- /registry → Not needed (fixed port, just connect)

### Component Flows

#### Git Sync Flow

```
Daemon watches git (file watcher or periodic)
  ↓
Detects changes (staged, unstaged, untracked)
  ↓
Reads untracked files < 100KB
  ↓
Writes to changeSnapshots[machineId]
  ↓
Browser reads reactively (Loro subscription)
```

#### Hook Connection Flow

```
Hook starts (CLI process)
  ↓
Connects to ws://localhost:56609/ws (Loro WebSocket adapter)
  ↓
Hook writes task to Loro doc
  ↓
Hook subscribes to meta.status
  ↓
Hook blocks until status === 'in_progress' (approved)
  ↓
Hook continues (no HTTP polling!)
```

#### MCP Process Flow

```
Claude Code: npx @shipyard/mcp-server
  ↓
Check: GET /health
  ↓ (if not running)
Spawn daemon: node dist/index.js --daemon
  ↓
Poll /health until success
  ↓
MCP ready → stdio to Claude Code
  (Daemon handles all MCP tools)
```

### Open Questions Resolved

| Question | Resolution | Date |
|----------|------------|------|
| Need RPC pattern? | ❌ NO - Push model only | 2026-02-01 |
| Session registry? | ✅ YES - Minimal (sessionId → planId) | 2026-02-01 |
| Untracked files? | ✅ Include in changeSnapshots (< 100KB) | 2026-02-01 |
| Agent output streaming? | ❌ NO - Skip for v1 | 2026-02-01 |
| Stop agent button? | ❌ NO - Defer for v1 | 2026-02-01 |
| Browser opening? | ❌ NO - Removed feature | 2026-02-01 |
| Spawn schemas? | ✅ Use @shipyard/signaling (exists) | 2026-02-01 |
| sessionTokenHash nullable? | ❌ NO - Required field | 2026-02-01 |
| Reinventing adapters? | ❌ NO - Use loro-extended | 2026-02-01 |
| Local artifacts? | ❌ NO - GitHub-only | 2026-02-01 |
| hoist routes/ up? | ✅ YES - Only 3 endpoints | 2026-02-01 |

### Migration Checklist Updates

**Phase 5 (Week 5) - Daemon Merge:**
- [ ] Create apps/mcp-server/ directory structure
- [ ] Configure loro-extended adapters (thin wrappers)
- [ ] Implement events/handlers.ts (spawn lifecycle)
- [ ] Implement events/git-sync.ts (auto-push)
- [ ] Port agents/ from daemon
- [ ] Port MCP tools from server (update imports)
- [ ] Add 3 HTTP routes
- [ ] Update packages/loro-schema with spawn events
- [ ] Add packages/loro-schema/src/session.ts
- [ ] Add packages/shared/src/identity.ts
- [ ] Rename apps/server → apps/server-legacy
- [ ] Rename apps/daemon → apps/daemon-legacy (after merge)

**Phase 6 (Week 6) - Browser + Hook:**
- [ ] Create useLoroSync hook
- [ ] Hook becomes WebSocket Loro client
- [ ] Browser spawns via spawn_requested events
- [ ] Test git auto-sync
- [ ] Verify 3 endpoints only

### Success Metrics

**By end of Phase 5:**
- [ ] apps/mcp-server/ builds successfully
- [ ] Daemon starts and accepts Loro connections
- [ ] Browser can write spawn_requested event
- [ ] Daemon spawns agent on event
- [ ] Git changes auto-sync to browser
- [ ] Hook connects via WebSocket
- [ ] Only 3 HTTP endpoints exist
- [ ] ~1,500-2,500 net lines deleted

---

*Last updated: 2026-02-01*
