# Shipyard Rebirth: Loro + Tiptap Migration Plan

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

**A. Design Work (First 2-3 days)**
1. Design Loro Shape
   - Full schema: metadata, content, comments, events, permissions
   - Container types (Tree, Map, List, Text)
   - Permission model (roles, grants, operations)
   - Signaling server permissions
   - Event storage format
   - **Document in new ADR**

2. Research Edge URL limit
   - Verify 2K vs 2M character limit
   - Test actual behavior
   - Decide support or document limitation

**B. Spike Work (Next 2-3 days)**
3. Spike: Tiptap + Loro
   - Minimal Vite app
   - Tiptap + loro-prosemirror integration
   - Test editing, comments, sync
   - Validate Loro cursor API
   - **Prove it works before committing**

**C. Setup (Final 1-2 days)**
4. Create package structure
   - `packages/loro-schema/` with designed Shape
   - `packages/editor/` with proven spike code
   - Add dependencies

**Deliverables:**
- [ ] Loro Shape designed and documented (ADR)
- [ ] Spike proves Tiptap + Loro works
- [ ] Edge URL limit researched
- [ ] Package structure created
- [ ] Go/No-Go decision made

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

### Phase 5: Daemon + Auth (Week 5)

**Goal:** Merge daemon, implement Shipyard JWT

**Tasks:**
1. Merge daemon into server
   - Move agent-spawner.ts to apps/server
   - Keep lock manager
   - Add WebSocket endpoint to loro-server
   - Bridge browser ↔ agent via Loro sync

2. Implement Shipyard JWT
   - JWT generation in hook
   - JWT validation in server
   - Update session-token.ts
   - Add expiration + scopes

3. Signaling updates
   - Adapt protocol for loro-extended WebRTC adapter
   - Test with Cloudflare DO
   - Deprecate Node.js adapter

**Deletions:**
- [ ] DELETE apps/daemon/ (merge into server)
- [ ] DELETE session token hash logic

**Deliverables:**
- [ ] Browser can spawn agents via server
- [ ] Agents receive Shipyard JWT
- [ ] JWT validation works
- [ ] Signaling works with Cloudflare

---

### Phase 6: Polish + Cut Over (Week 6)

**Goal:** Remove old code, final testing

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
