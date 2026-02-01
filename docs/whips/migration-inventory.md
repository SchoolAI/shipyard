# Loro Migration Inventory

Complete inventory of files requiring changes for the Yjs → Loro + BlockNote → Tiptap migration.

**Date:** 2026-01-31
**Scope:** Full rebirth based on production learnings

---

## File Counts by Impact

| Impact Level | Count | Action |
|--------------|-------|--------|
| **DELETE** | 25+ files | Complete removal, no migration |
| **REWRITE** | 15-20 files | Keep file, new implementation |
| **UPDATE** | 60+ files | Change imports/types only |
| **UNCHANGED** | 40+ files | Business logic, types, utils |

**Total files affected:** ~100-105 out of ~400 total files (25% of codebase)

---

## 1. Complete Deletions (No Migration)

### packages/schema/ - Replace Entirely
```bash
DELETE packages/schema/src/yjs-helpers.ts          # 2,133 lines - Loro helpers instead
DELETE packages/schema/src/yjs-keys.ts             # 229 lines - Loro shape keys instead
DELETE packages/schema/src/y-webrtc-internals.ts   # 112 lines - loro-extended provides
DELETE packages/schema/src/change-snapshot-helpers.ts  # Update for Loro
```

**Keep from packages/schema:**
- plan.ts (types mostly unchanged)
- url-encoding.ts (format agnostic)
- input-request.ts (unchanged)
- conversation-export.ts (unchanged)
- All type definitions, schemas, formatters

**Create new:** `packages/loro-schema/` with Loro equivalents

---

### apps/server/ - Delete Sync Infrastructure
```bash
DELETE apps/server/src/registry-server.ts          # ~600 lines - loro-extended replaces
DELETE apps/server/src/hub-client.ts               # 165 lines - loro-extended replaces
DELETE apps/server/src/doc-store.ts                # 182 lines - loro-extended Repo replaces
DELETE apps/server/src/webrtc-provider.ts          # 331 lines - loro-extended adapter
DELETE apps/server/src/y-leveldb.d.ts              # 31 lines - type definitions
DELETE apps/server/src/subscriptions/observers.ts  # Rewrite for Loro events
```

**Create new:**
- loro-server.ts (loro-extended Repo setup)
- loro-observers.ts (Loro event subscriptions)
- adapters/leveldb-storage.ts (LevelDBStorageAdapter)

---

### apps/web/ - Delete Provider Management
```bash
DELETE apps/web/src/hooks/useMultiProviderSync.ts  # 792 lines - loro-extended Repo
DELETE apps/web/src/hooks/useYjsSync.ts            # 44 lines - obsolete
DELETE apps/web/src/hooks/useP2PPeers.ts           # 208 lines - loro-extended presence
DELETE apps/web/src/utils/createPlanBrowserOnly.ts # Rewrite for Loro
DELETE apps/web/src/utils/epochReset.ts            # Epoch handling changes
DELETE apps/web/src/types/blocknote-extensions.ts  # BlockNote specific
DELETE apps/web/src/types/y-webrtc-internals.ts    # 19 lines - Yjs internals
```

**Create new:**
- hooks/useLoroSync.ts (loro-extended Repo setup)
- adapters/indexeddb-storage.ts (IndexedDBStorageAdapter)

---

### apps/web/src/components/ - Delete BlockNote UI
```bash
DELETE apps/web/src/components/editor/AddCommentToolbarButton.tsx
DELETE apps/web/src/components/editor/UndoButton.tsx
DELETE apps/web/src/components/editor/RedoButton.tsx
DELETE apps/web/src/components/PlanViewer.tsx      # Rewrite with Tiptap
DELETE apps/web/src/components/comments/CommentGutter.tsx  # Rebuild in @shipyard/editor
DELETE apps/web/src/hooks/useBlockPositions.ts     # Rebuild for Tiptap
DELETE apps/web/src/hooks/useThreads.ts            # Rebuild for Loro comments
```

**Create new:** All rebuilt in `packages/editor/`

---

### CSS/Styling
```bash
# Remove from apps/web/src/main.tsx
DELETE imports:
  - @blocknote/core/fonts/inter.css
  - @blocknote/core/style.css
  - @blocknote/mantine/style.css
  - @mantine/core/styles.css (if only used for BlockNote)
```

---

## 2. Files to Rewrite (Keep Filename, New Implementation)

### Server Tools (8 files)
All tools keep same purpose, rewrite implementation:

| File | Current | New |
|------|---------|-----|
| `apps/server/src/tools/create-task.ts` | ServerBlockNoteEditor → Y.XmlFragment | loro-schema helpers → LoroDoc |
| `apps/server/src/tools/update-block-content.ts` | BlockNote block operations | Loro map/list operations |
| `apps/server/src/tools/add-artifact.ts` | yXmlFragmentToBlocks | Loro serialization |
| `apps/server/src/tools/read-task.ts` | Export via BlockNote | Export via Tiptap JSON |
| `apps/server/src/tools/update-task.ts` | BlockNote snapshots | Loro snapshots |
| `apps/server/src/tools/pr-helpers.ts` | blocksToMarkdownLossy | Tiptap → Markdown |
| `apps/server/src/export-markdown.ts` | ServerBlockNoteEditor | Tiptap getJSON() → Markdown |
| `apps/server/src/hook-handlers.ts` | yjs-helpers | loro-schema helpers |

**Estimated: 200-300 lines per file (total ~1,600-2,400 lines)**

---

### Core Hooks (5 files)

| File | Current | New |
|------|---------|-----|
| `apps/web/src/hooks/usePlanPageState.ts` | useMultiProviderSync | useLoroSync |
| `apps/web/src/hooks/usePlanMetadata.ts` | Y.Doc + IndexedDB | loro-extended useDocument |
| `apps/web/src/hooks/usePlanIndex.ts` | Y.Doc plan index | Loro plan index |
| `apps/web/src/hooks/useInboxEvents.ts` | Y.Doc events | Loro events |
| `apps/web/src/hooks/useKanbanDragHandlers.ts` | Y.Doc updates | Loro updates |

**Estimated: 50-100 lines per file (total ~250-500 lines)**

---

### Components (3 files)

| File | Current | New |
|------|---------|-----|
| `apps/web/src/components/PlanViewer.tsx` | BlockNoteView | Tiptap EditorContent |
| `apps/web/src/components/PlanContent.tsx` | BlockNote types | Tiptap types |
| `apps/web/src/components/InlinePlanDetail.tsx` | BlockNoteEditor ref | Tiptap Editor ref |

**Estimated: 100-200 lines per file (total ~300-600 lines)**

---

## 3. Files to Update (Type/Import Changes Only)

### Import Updates (~60 files)

**Pattern:**
```typescript
// Before
import { getPlanMetadata, getArtifacts } from '@shipyard/schema';
import type * as Y from 'yjs';
const metadata = getPlanMetadata(ydoc);

// After
import { getPlanMetadata, getArtifacts } from '@shipyard/loro-schema';
import type { LoroDoc } from 'loro-crdt';
const metadata = getPlanMetadata(loroDoc);
```

**Files affected:**
- All components in apps/web/src/components/ (~30 files)
- All hooks in apps/web/src/hooks/ (~20 files)
- All pages in apps/web/src/pages/ (~5 files)
- Test files (~5 files)

**Estimated effort:** Find-replace + type fixes (5-10 min per file)

---

## 4. Dependencies Changes

### Remove from package.json
```json
{
  "dependencies": {
    // DELETE - Yjs ecosystem
    "yjs": "^13.6.29",
    "y-websocket": "^3.0.0",
    "y-webrtc": "^10.3.0",
    "y-indexeddb": "^9.0.12",
    "y-leveldb": "^0.2.0",
    "y-protocols": "^1.0.7",
    "lib0": "^0.2.117",

    // DELETE - BlockNote
    "@blocknote/core": "^0.46.1",
    "@blocknote/mantine": "^0.46.1",
    "@blocknote/react": "^0.46.1",
    "@blocknote/server-util": "^0.46.1",

    // DELETE - Mantine (if only used for BlockNote)
    "@mantine/core": "^8.3.13",
    "@mantine/hooks": "^8.3.13",

    // DELETE - WebRTC polyfill (loro-extended handles)
    "@roamhq/wrtc": "^0.9.1",
    "@roamhq/wrtc-linux-x64": "^0.9.1"
  }
}
```

### Add to package.json
```json
{
  "dependencies": {
    // ADD - Loro ecosystem
    "loro-crdt": "^1.x",
    "loro-prosemirror": "^0.x",
    "@loro-extended/repo": "workspace:*",  // Internal SchoolAI package
    "@loro-extended/adapter-webrtc": "workspace:*",
    "@loro-extended/adapter-indexeddb": "workspace:*",
    "@loro-extended/adapter-leveldb": "workspace:*",
    "@loro-extended/react": "workspace:*",

    // ADD - Tiptap
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-drag-handle-react": "^2.x",
    "@tiptap/suggestion": "^2.x",  // For slash commands if needed

    // KEEP - Already have
    "@heroui/react": "3.0.0-beta.3",  // For editor UI
    "react": "^19.2.3"
  }
}
```

**Net dependency change:**
- Remove: 13 packages (Yjs + BlockNote ecosystem)
- Add: 11 packages (Loro + Tiptap ecosystem)
- Net: -2 dependencies

---

## 5. Data Migration Strategy

### Snapshots

**Current format:**
```typescript
{
  id: string;
  content: Block[];  // BlockNote Block[]
  createdAt: number;
  ...
}
```

**New format:**
```typescript
{
  id: string;
  content: JSONContent;  // Tiptap JSON
  createdAt: number;
  ...
}
```

**Migration:**
- Option A: Drop old snapshots (acceptable for rebirth)
- Option B: Build converter (BlockNote Block[] → Tiptap JSON)
- Option C: Export all to markdown first

**Recommendation:** Option A (fresh start)

---

### URL Encoding

**Current:** Compressed BlockNote Block[] in `?d=` parameter

**New:** Compressed Tiptap JSON in `?d=` parameter

**Migration:**
- Version 3 format
- Old URLs return 404 with "format no longer supported"
- Provide export tool if needed

---

### IndexedDB Data

**Current:** Yjs binary updates in IndexedDB

**New:** Loro binary snapshots in IndexedDB

**Migration:**
- Browser reset required (delete old IndexedDB)
- Auto-detect on load: if Yjs format, show migration banner
- Export to markdown before clearing

---

## 6. Testing Strategy

### Unit Tests
- loro-schema helpers (copy test patterns from yjs-helpers.test.ts)
- Storage adapters (IndexedDB, LevelDB)
- Editor integration (Tiptap + loro-prosemirror)

### Integration Tests
- Browser ↔ Server sync (WebSocket)
- Browser ↔ Browser sync (WebRTC)
- Persistence (IndexedDB, LevelDB)
- Comments (create, reply, resolve)
- Version history (snapshots)

### E2E Tests
- Full workflow: Create plan → Edit → Approve → Agent runs → Upload artifact
- Multi-device: Edit on laptop, view on phone
- Offline: Edit offline, sync when back online

**Test file estimate:** ~1,000-1,500 lines of new tests

---

## 7. Rollback Scenarios

### If Migration Fails

**Week 1-2:** Just delete new packages, revert dependency changes
**Week 3-4:** Feature flag flip back to Yjs
**Week 5+:** Export data to markdown, reimport to old system

### If loro-extended Has Issues

- Fallback: Implement custom Loro sync (similar to current Yjs approach)
- Estimated: +2 weeks if needed
- Unlikely: loro-extended is SchoolAI internal, should be battle-tested

---

## 8. Critical Success Factors

### Must Validate Early (Week 1)

1. **loro-prosemirror works with Tiptap**
   - Spike: Basic Tiptap + loro-prosemirror integration
   - Ensure sync works bidirectionally
   - Test undo/redo

2. **loro-extended Repo works as advertised**
   - Spike: Repo with 3 adapters
   - Test connection state management
   - Test adapter coordination

3. **Comment marks work**
   - Spike: Tiptap mark extension
   - Test Loro cursor API for anchoring
   - Test selection → thread mapping

**Go/No-Go Decision:** End of Week 1 after spikes

---

## 9. Migration Risks

### High Risk
- 🔴 loro-prosemirror incomplete/buggy
- 🔴 Comment anchoring doesn't work with Loro cursors
- 🔴 loro-extended has production issues

### Medium Risk
- 🟡 Performance regression (Loro slower than Yjs?)
- 🟡 Bundle size increase (both libraries larger?)
- 🟡 WebRTC signaling protocol incompatibility

### Low Risk
- 🟢 Storage adapter implementation (clear patterns)
- 🟢 Type system migration (mechanical find-replace)
- 🟢 UI component updates (just prop changes)

---

## 10. Success Metrics

### Technical
- [ ] Sync latency < 100ms (same as Yjs)
- [ ] Bundle size < 500KB (acceptable)
- [ ] P2P connection success > 85% (same as Yjs)
- [ ] Zero data loss in normal operation

### User Experience
- [ ] Editing feels instant (no lag)
- [ ] Comments work reliably
- [ ] Offline mode works
- [ ] Multi-device sync works

### Code Quality
- [ ] 30%+ less sync code
- [ ] No circuit breakers or workarounds
- [ ] Clean adapter pattern
- [ ] All tests pass

---

## Appendix: File Reference

### Files by Package

**packages/schema/** (54 files total)
- DELETE: 3 files (yjs-helpers, yjs-keys, y-webrtc-internals)
- KEEP: 51 files (types, formatters, utils)

**apps/server/src/** (80+ files total)
- DELETE: 6 files (sync infrastructure)
- REWRITE: 10 files (tools + handlers)
- UPDATE: 20 files (import changes)
- KEEP: 44+ files (business logic)

**apps/web/src/** (200+ files total)
- DELETE: 8 files (provider management, BlockNote UI)
- REWRITE: 5 files (PlanViewer, core hooks)
- UPDATE: 60+ files (type changes)
- KEEP: 127+ files (UI components, routing, etc.)

**apps/signaling/** (15 files total)
- MINIMAL CHANGES: Protocol adaptation only

**apps/daemon/** (6 files total)
- MERGE: Move into apps/server

---

## Timeline by File Count

| Week | Delete | Rewrite | Update | New |
|------|--------|---------|--------|-----|
| 1 | 0 | 0 | 0 | 10 (foundation) |
| 2 | 6 | 10 | 0 | 5 (server) |
| 3 | 8 | 5 | 60 | 5 (browser) |
| 4 | 0 | 5 | 0 | 10 (features) |
| 5 | 6 | 3 | 10 | 5 (daemon + auth) |
| 6 | 5 | 0 | 0 | 0 (cleanup) |
| **Total** | **25** | **23** | **70** | **35** |

**Total files touched:** ~153 files over 6 weeks

---

This inventory provides the complete scope for planning and tracking the migration.
