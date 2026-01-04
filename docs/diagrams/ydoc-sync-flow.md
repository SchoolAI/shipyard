# Y.Doc Sync Flow Diagrams

Visual diagrams showing how Y.Doc keys are used across the system.

## 1. Plan Creation Flow (Server → Browser)

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT CREATES PLAN                       │
│                 (create_plan MCP tool)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER: packages/server/src/tools/             │
│                    create-plan.ts                           │
│                                                             │
│  1. Parse markdown → Block[]                                │
│                                                             │
│  2. ydoc.transact(() => {                                   │
│       // Write to CONTENT array (for JSON snapshots)       │
│       const contentArray = ydoc.getArray('content')         │
│       contentArray.push(blocks)                             │
│                                                             │
│       // Write to DOCUMENT_FRAGMENT (for BlockNote)        │
│       const fragment = ydoc.getXmlFragment('document')      │
│       editor.blocksToYXmlFragment(blocks, fragment)         │
│                                                             │
│       // Write METADATA                                     │
│       const metadata = ydoc.getMap('metadata')              │
│       metadata.set('id', planId)                            │
│       metadata.set('title', title)                          │
│       metadata.set('status', 'draft')                       │
│     })                                                      │
│                                                             │
│  3. Persist to LevelDB                                      │
│                                                             │
│  4. Create URL with snapshot                                │
│                                                             │
│  5. Open browser                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ WebSocket (y-websocket)
                       │ Y.Doc updates sync automatically
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              BROWSER: packages/web/src/                     │
│                                                             │
│  1. URL contains snapshot (fallback)                        │
│                                                             │
│  2. WebSocket connects to server                            │
│     ┌────────────────────────────────────┐                 │
│     │   useMultiProviderSync(planId)     │                 │
│     │   - Creates Y.Doc                  │                 │
│     │   - Connects y-websocket           │                 │
│     │   - Connects y-indexeddb           │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  3. Y.Doc syncs from server                                 │
│     ┌────────────────────────────────────┐                 │
│     │  Server Y.Doc State                │                 │
│     │  ├─ METADATA ────────┐             │                 │
│     │  ├─ CONTENT ─────────┤             │                 │
│     │  └─ DOCUMENT_FRAGMENT┘             │                 │
│     └───────────┬────────────────────────┘                 │
│                 │ Sync via WebSocket                       │
│                 ▼                                           │
│     ┌────────────────────────────────────┐                 │
│     │  Browser Y.Doc State               │                 │
│     │  ├─ METADATA (synced) ✅           │                 │
│     │  ├─ CONTENT (synced) ✅            │                 │
│     │  └─ DOCUMENT_FRAGMENT (synced) ✅  │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  4. PlanViewer renders                                      │
│     ┌────────────────────────────────────┐                 │
│     │  const editor = useCreateBlockNote(│                 │
│     │    collaboration: {                │                 │
│     │      fragment: ydoc.getXmlFragment(│                 │
│     │        YDOC_KEYS.DOCUMENT_FRAGMENT │ ← CRITICAL!     │
│     │      )                             │                 │
│     │    }                               │                 │
│     │  )                                 │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  ✅ User sees content immediately!                          │
└─────────────────────────────────────────────────────────────┘
```

## 2. URL-Only Mode (No Server Connection)

```
┌─────────────────────────────────────────────────────────────┐
│              USER OPENS URL (OFFLINE)                       │
│         http://localhost:5173/plan#v=1&...                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              BROWSER: packages/web/src/                     │
│                                                             │
│  1. Parse URL snapshot                                      │
│     ┌────────────────────────────────────┐                 │
│     │  getPlanFromUrl(location.hash)     │                 │
│     │  → UrlEncodedPlan {                │                 │
│     │      id, title, status,            │                 │
│     │      content: Block[]              │                 │
│     │    }                               │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  2. Create empty Y.Doc                                      │
│     ┌────────────────────────────────────┐                 │
│     │  useMultiProviderSync(planId)      │                 │
│     │  - Creates Y.Doc                   │                 │
│     │  - Tries WebSocket (fails)         │                 │
│     │  - Connects y-indexeddb            │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  3. Hydrate from URL snapshot                               │
│     ┌────────────────────────────────────┐                 │
│     │  useHydration(ydoc, urlPlan)       │                 │
│     │                                    │                 │
│     │  if (metadata.size === 0) {        │                 │
│     │    // Y.Doc is empty, hydrate      │                 │
│     │    ydoc.transact(() => {           │                 │
│     │      // Write METADATA             │                 │
│     │      initPlanMetadata(ydoc, ...)   │                 │
│     │                                    │                 │
│     │      // Write CONTENT array        │                 │
│     │      const content = ydoc.getArray(│                 │
│     │        YDOC_KEYS.CONTENT           │                 │
│     │      )                             │                 │
│     │      content.push(blocks)          │                 │
│     │    })                              │                 │
│     │  }                                 │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  4. BlockNote initializes from CONTENT                      │
│     ┌────────────────────────────────────┐                 │
│     │  const editor = useCreateBlockNote(│                 │
│     │    // No collaboration (offline)   │                 │
│     │    initialContent: urlPlan.content │                 │
│     │  )                                 │                 │
│     │                                    │                 │
│     │  BlockNote creates its own         │                 │
│     │  DOCUMENT_FRAGMENT from            │                 │
│     │  initialContent                    │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  ✅ User sees content in read-only mode                     │
└─────────────────────────────────────────────────────────────┘
```

## 3. Comment Thread Flow

```
┌─────────────────────────────────────────────────────────────┐
│            USER ADDS COMMENT IN BROWSER                     │
│         (Select text → Click "Add Comment")                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│       BROWSER: packages/web/src/components/                 │
│                 PlanViewer.tsx                              │
│                                                             │
│  1. Initialize YjsThreadStore                               │
│     ┌────────────────────────────────────┐                 │
│     │  const threadsMap =                │                 │
│     │    ydoc.getMap(YDOC_KEYS.THREADS)  │                 │
│     │                                    │                 │
│     │  const threadStore =               │                 │
│     │    new YjsThreadStore(             │                 │
│     │      userId,                       │                 │
│     │      threadsMap,  ← Shared Map     │                 │
│     │      auth                          │                 │
│     │    )                               │                 │
│     └────────────────────────────────────┘                 │
│                                                             │
│  2. User types comment → BlockNote writes to threadsMap     │
│                                                             │
│  3. threadsMap.set(threadId, {                              │
│       id: threadId,                                         │
│       comments: [{ id, userId, body, createdAt }],          │
│       selectedText: "highlighted text",                     │
│       resolved: false                                       │
│     })                                                      │
│                                                             │
│  4. Change syncs via WebSocket                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Y.Doc THREADS map update
                       │ syncs automatically
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER: LevelDB persistence                    │
│                                                             │
│  ydoc.getMap(YDOC_KEYS.THREADS) persisted                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Agent calls get_feedback
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│       SERVER: packages/server/src/tools/                    │
│                 get-feedback.ts                             │
│                                                             │
│  const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS)          │
│  const threadsData = threadsMap.toJSON()                    │
│  const threads = parseThreads(threadsData)                  │
│                                                             │
│  exportFeedback(threads) → Markdown report                  │
│                                                             │
│  Returns to agent:                                          │
│    # Plan Feedback                                          │
│    ## 1. Comment on: "..."                                  │
│    > Review comment text                                    │
│    - Author: user123                                        │
└─────────────────────────────────────────────────────────────┘
```

## 4. Review Status Update Flow

```
┌─────────────────────────────────────────────────────────────┐
│           USER CLICKS "APPROVE" BUTTON                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│       BROWSER: packages/web/src/components/                 │
│                 ReviewActions.tsx                           │
│                                                             │
│  ydoc.transact(() => {                                      │
│    const metadata = ydoc.getMap(YDOC_KEYS.METADATA)         │
│    metadata.set('status', 'approved')                       │
│    metadata.set('reviewedAt', Date.now())                   │
│    metadata.set('reviewedBy', identity.displayName)         │
│    metadata.set('updatedAt', Date.now())                    │
│  })                                                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Updates plan index:                                        │
│  setPlanIndexEntry(indexDoc, {                              │
│    id: planId,                                              │
│    status: 'approved',                                      │
│    updatedAt: Date.now()                                    │
│  })                                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Two Y.Doc updates:
                       │ 1. Plan doc METADATA
                       │ 2. Index doc PLANS
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              SERVER: LevelDB persistence                    │
│                                                             │
│  Both changes persisted automatically                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Sync to all connected peers
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           OTHER BROWSERS / PEERS                            │
│                                                             │
│  metadata.observe(() => {                                   │
│    const newStatus = metadata.get('status')                 │
│    updateUI(newStatus) // Shows "Approved" badge            │
│  })                                                         │
└─────────────────────────────────────────────────────────────┘
```

## 5. Key Mismatch (The Bug We Fixed)

### Before Fix (BROKEN)

```
SERVER (create-plan.ts)
  │
  └─► ydoc.getArray('content').push(blocks)
       │
       └─► Stores: Y.Doc { content: [Block, Block, ...] }
                            ^^^^^^^^ Y.Array

       ✗ Never creates 'document' XmlFragment!

                    ╳  ╳  ╳  NO SYNC  ╳  ╳  ╳

BROWSER (PlanViewer.tsx)
  │
  └─► const editor = useCreateBlockNote({
         collaboration: {
           fragment: ydoc.getXmlFragment('document')
                                          ^^^^^^^^
                                          Empty! No data!
         }
      })

Result: Editor is blank! 😱
```

### After Fix (WORKING)

```
SERVER (create-plan.ts)
  │
  ├─► ydoc.getArray('content').push(blocks)
  │    │
  │    └─► For: Snapshots, JSON serialization, MCP tools
  │
  └─► const fragment = ydoc.getXmlFragment('document')
       editor.blocksToYXmlFragment(blocks, fragment)
       │
       └─► For: BlockNote collaborative editing

                    ✓  ✓  ✓  SYNCS  ✓  ✓  ✓

BROWSER (PlanViewer.tsx)
  │
  └─► const editor = useCreateBlockNote({
         collaboration: {
           fragment: ydoc.getXmlFragment('document')
                                          ^^^^^^^^
                                          Has data! ✅
         }
      })

Result: Editor shows content! 🎉
```

## 6. Y.Doc Key Usage Matrix

| Key | Type | Server Writes | Server Reads | Browser Writes | Browser Reads |
|-----|------|---------------|--------------|----------------|---------------|
| `metadata` | Y.Map | ✅ create-plan | ✅ read-plan, get-feedback | ✅ ReviewActions, useHydration | ✅ PlanPage, PlanViewer |
| `content` | Y.Array | ✅ create-plan | ✅ read-plan | ✅ useHydration | ✅ PlanPage (fallback) |
| `document` | Y.XmlFragment | ✅ create-plan | ❌ | ✅ BlockNote editor | ✅ PlanViewer (BlockNote) |
| `threads` | Y.Map | ❌ | ✅ get-feedback | ✅ BlockNote (YjsThreadStore) | ✅ PlanViewer, CommentsPanel |
| `stepCompletions` | Y.Map | ❌ | ❌ | ✅ toggleStepCompletion | ✅ StepCheckbox |
| `plans` | Y.Map | ✅ create-plan, update-plan | ✅ list-plans | ✅ PlanPage (status update) | ✅ usePlanIndex |

## Legend

- ✅ = Used in this context
- ❌ = Not used in this context
- Y.Array = Yjs array type (JSON-like)
- Y.XmlFragment = Yjs XML fragment (ProseMirror document structure)
- Y.Map = Yjs map type (key-value store)
