# Yjs Data Model

**The definitive guide to shipyard's CRDT-based data model.**

This document explains how shipyard uses Yjs for collaborative editing, real-time synchronization, and conflict-free state management.

---

## Table of Contents

1. [Context & Background](#context--background)
2. [Y.Doc Structure Overview](#ydoc-structure-overview)
3. [Part 1: BlockNote Content](#part-1-blocknote-content)
4. [Part 2: Plan Metadata](#part-2-plan-metadata)
5. [Part 3: Comments & Threads](#part-3-comments--threads)
6. [Sync Strategy](#sync-strategy)
7. [URL Snapshots vs Y.Doc State](#url-snapshots-vs-ydoc-state)
8. [Code Examples](#code-examples)
9. [Migration Path](#migration-path)
10. [Best Practices](#best-practices)

---

## Context & Background

### Why Yjs?

Shipyard uses **Yjs** as its CRDT (Conflict-free Replicated Data Type) system because:

1. **BlockNote is Yjs-native**: Our block editor uses Yjs internally (Y.Doc, Y.XmlFragment)
2. **Built-in comments**: BlockNote's YjsThreadStore provides threaded comments out-of-the-box
3. **Single CRDT system**: One sync system instead of mixing Yjs + Loro
4. **Mature ecosystem**: Battle-tested in production (Figma, Notion use similar tech)

See [ADR-0001](./decisions/0001-use-yjs-not-loro.md) for the decision rationale.

### What is a Y.Doc?

A `Y.Doc` is a Yjs document that contains all shared state for a plan. It's:
- **Distributed**: Exists across multiple peers simultaneously
- **Eventually consistent**: All peers converge to the same state
- **Conflict-free**: Concurrent edits merge automatically without conflicts

---

## Y.Doc Structure Overview

Every plan is represented by a single `Y.Doc` with three main compartments:

```
┌─────────────────────────────────────────────────────────────┐
│                         Y.Doc                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. BlockNote Content                                       │
│     ├── ydoc.getXmlFragment('document')                     │
│     │   (for BlockNote collaboration)                       │
│     ├── ydoc.getArray('content')                            │
│     │   (for JSON serialization/URLs)                       │
│     └── Managed by: BlockNote + our helpers                 │
│                                                             │
│  2. Plan Metadata                                           │
│     ├── ydoc.getMap('metadata')                             │
│     └── Managed by: Us (via yjs-helpers.ts)                 │
│                                                             │
│  3. Comments/Threads                                        │
│     ├── ydoc.getMap('threads')                              │
│     └── Managed by: BlockNote's YjsThreadStore              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Note**: Content is stored in TWO places:
- `'document'` Y.XmlFragment: For BlockNote real-time collaboration
- `'content'` Y.Array: For JSON export (URL snapshots, read_plan tool)

### Visual Diagram

```
               ┌──────────────────────────────────────────┐
               │            Browser A                     │
               │  ┌────────────────────────────────────┐  │
               │  │         Y.Doc                      │  │
               │  │  ┌──────────────────────────────┐  │  │
               │  │  │ BlockNote Content            │  │  │
               │  │  │ (paragraphs, headings, etc)  │  │  │
               │  │  └──────────────────────────────┘  │  │
               │  │  ┌──────────────────────────────┐  │  │
               │  │  │ Metadata                     │  │  │
               │  │  │ {id, title, status, ...}     │  │  │
               │  │  └──────────────────────────────┘  │  │
               │  │  ┌──────────────────────────────┐  │  │
               │  │  │ Threads                      │  │  │
               │  │  │ (comments, replies)          │  │  │
               │  │  └──────────────────────────────┘  │  │
               │  │                                    │  │
               │  │  y-indexeddb: Local persistence   │  │
               │  └────────────────────────────────────┘  │
               └──────────┬──────────────────────────┬────┘
                          │                          │
                  y-websocket                  y-webrtc
                          │                          │
                          ▼                          ▼
               ┌──────────────────────┐   ┌─────────────────┐
               │   MCP Server         │   │   Browser B     │
               │   (Node.js)          │   │   (Remote Peer) │
               │   Y.Doc instance     │   │   Y.Doc replica │
               └──────────────────────┘   └─────────────────┘
```

---

## Part 1: BlockNote Content

### What is it?

BlockNote content is the rich text document containing all blocks (paragraphs, headings, code, lists, etc.).

### Storage Location

```typescript
const documentFragment = ydoc.getXmlFragment('document');
```

**IMPORTANT**: We use `'document'` as the fragment key, not `'blocknote'`. This is because BlockNote's collaboration requires a consistent key across all peers.

### Who Manages It?

**BlockNote** manages this automatically. You interact with it through BlockNote's editor API, not directly via Yjs.

### Structure

BlockNote internally uses:
- `Y.XmlFragment` for the document structure
- `Y.XmlElement` for each block
- `Y.Text` for rich text content within blocks

### How to Work With It

```typescript
import { useCreateBlockNote } from '@blocknote/react';
import * as Y from 'yjs';

function MyEditor() {
  const ydoc = useYDoc(); // Your Y.Doc instance

  const editor = useCreateBlockNote({
    // Pass the Y.Doc to BlockNote
    collaboration: {
      provider: ydoc,
      fragment: ydoc.getXmlFragment('document'),
      user: {
        name: 'Alice',
        color: '#ff0000',
      },
    },
  });

  // BlockNote handles all synchronization automatically
  return <BlockNoteView editor={editor} />;
}
```

### Key Points

- **Don't mutate directly**: Always use BlockNote's API
- **Automatic sync**: Changes sync via Yjs providers automatically
- **Block IDs**: Each block has a stable ID that survives edits
- **Rich text**: Supports bold, italic, links, inline code, etc.

### BlockNote Block Schema

Each block has this structure:

```typescript
interface Block {
  id: string;                    // Unique block ID
  type: string;                  // 'paragraph', 'heading', 'code', etc.
  props: Record<string, any>;    // Block properties
  content: InlineContent[];      // Rich text content
  children: Block[];             // Nested blocks
}
```

Example:

```typescript
{
  id: 'block-abc123',
  type: 'paragraph',
  props: {
    backgroundColor: 'default',
    textColor: 'default',
    textAlignment: 'left',
  },
  content: [
    { type: 'text', text: 'Create auth middleware', styles: { bold: true } }
  ],
  children: []
}
```

---

## Part 2: Plan Metadata

### What is it?

Plan metadata stores information about the plan itself: ID, title, status, timestamps, GitHub references.

### Storage Location

```typescript
const metadataMap = ydoc.getMap('metadata');
```

### Who Manages It?

**We manage this** using type-safe helpers in `packages/schema/src/yjs-helpers.ts`.

### Schema

Defined in `packages/schema/src/plan.ts`:

```typescript
interface PlanMetadata {
  id: string;                    // Plan ID (stable identifier)
  title: string;                 // Plan title
  status: 'draft' | 'pending_review' | 'approved' | 'changes_requested';
  createdAt: number;             // Unix timestamp (ms)
  updatedAt: number;             // Unix timestamp (ms)
  repo?: string;                 // GitHub repo (e.g., 'org/repo')
  pr?: number;                   // PR number
}
```

### Type Safety

We use **Zod** for runtime validation:

```typescript
import { PlanMetadataSchema } from '@shipyard/schema';

// Validates at runtime
const result = PlanMetadataSchema.safeParse(data);
if (result.success) {
  const metadata = result.data; // Typed as PlanMetadata
}
```

### Why Y.Map?

`Y.Map` is Yjs's CRDT-based key-value store. It provides:
- **Conflict-free updates**: Multiple peers can update different fields simultaneously
- **Last-write-wins**: For the same key, the latest write wins (with Lamport timestamps)
- **Observability**: Can listen for changes

### Limitations

- **Not type-safe by default**: Y.Map keys/values are `any`
- **No nested validation**: Zod validates after extraction, not during writes
- **Manual tracking**: Must call `map.set()` for each field change

See [yjs-helpers.ts](../packages/schema/src/yjs-helpers.ts) for type-safe wrappers.

---

## Part 3: Comments & Threads

### What is it?

Comments are threaded discussions anchored to specific blocks in the document.

### Storage Location

```typescript
const threadsMap = ydoc.getMap('threads');
```

### Who Manages It?

**BlockNote's YjsThreadStore** manages this. You interact through BlockNote's commenting API.

### Structure

Each thread has:
- **ID**: Unique thread identifier
- **Block ID**: Which block the thread is anchored to
- **Comments**: Array of comment objects
- **Resolved status**: Whether the thread is resolved

### How to Work With It

```typescript
import { YjsThreadStore } from '@blocknote/react';

function MyEditor() {
  const ydoc = useYDoc();
  const editor = useCreateBlockNote({
    collaboration: {
      provider: ydoc,
      fragment: ydoc.getXmlFragment('document'),
      user: { name: 'Alice', color: '#ff0000' },
    },
  });

  // BlockNote provides a thread store
  const threadStore = YjsThreadStore.create(ydoc);

  return (
    <BlockNoteView
      editor={editor}
      threads={threadStore}
    />
  );
}
```

### Key Points

- **Block-anchored**: Comments attach to specific blocks via block ID
- **Threaded**: Supports replies, forming conversation trees
- **Resolved state**: Threads can be marked as resolved
- **User attribution**: Each comment tracks author info
- **Reactions**: BlockNote supports emoji reactions (optional)

### Comment Schema

```typescript
interface Comment {
  id: string;              // Comment ID
  threadId: string;        // Parent thread ID
  author: {
    name: string;
    color: string;
  };
  content: string;         // Comment text
  createdAt: number;       // Unix timestamp
  updatedAt?: number;      // Unix timestamp (if edited)
}

interface Thread {
  id: string;              // Thread ID
  blockId: string;         // Which block this is attached to
  comments: Comment[];     // All comments in thread
  resolved: boolean;       // Resolution status
}
```

---

## Sync Strategy

Shipyard uses three Yjs sync providers depending on the scenario:

### 1. y-websocket (MCP Server ↔ Browser)

**Purpose**: Sync between AI agent's MCP server and author's browser

```typescript
import { WebsocketProvider } from 'y-websocket';

const wsProvider = new WebsocketProvider(
  'ws://localhost:3000',  // MCP server WebSocket URL
  'plan-abc123',          // Plan ID (room name)
  ydoc                    // Y.Doc instance
);

// Provider automatically syncs all changes
wsProvider.on('sync', (isSynced: boolean) => {
  console.log('Synced with server:', isSynced);
});
```

**Flow**:
```
AI Agent → MCP Server → WebSocket → Browser
         ← Y.Doc sync ←          ←
```

### 2. y-indexeddb (Browser Persistence)

**Purpose**: Persist Y.Doc state in browser across page refreshes

```typescript
import { IndexeddbPersistence } from 'y-indexeddb';

const indexeddbProvider = new IndexeddbPersistence(
  'plan-abc123',  // Plan ID (database name)
  ydoc            // Y.Doc instance
);

// Automatically saves all changes to IndexedDB
indexeddbProvider.on('synced', () => {
  console.log('Loaded from IndexedDB');
});
```

**Flow**:
```
Y.Doc changes → IndexedDB (automatic)
On page load: IndexedDB → Y.Doc (automatic)
```

### 3. y-webrtc (Browser ↔ Remote Peers)

**Purpose**: P2P sync between multiple browsers (Milestone 6)

```typescript
import { WebrtcProvider } from 'y-webrtc';

const webrtcProvider = new WebrtcProvider(
  'plan-abc123',                          // Plan ID (room name)
  ydoc,                                   // Y.Doc instance
  {
    signaling: ['wss://signaling.yjs.dev'], // Public signaling server
  }
);

// Automatically discovers and syncs with other peers
webrtcProvider.on('peers', (peers: { id: number }[]) => {
  console.log('Connected peers:', peers.length);
});
```

**Flow**:
```
Browser A ← WebRTC P2P → Browser B
          (via signaling server discovery)
```

### Provider Lifecycle

All providers should be cleaned up when no longer needed:

```typescript
useEffect(() => {
  const ydoc = new Y.Doc();
  const wsProvider = new WebsocketProvider('ws://localhost:3000', planId, ydoc);
  const indexeddbProvider = new IndexeddbPersistence(planId, ydoc);

  return () => {
    wsProvider.destroy();
    indexeddbProvider.destroy();
  };
}, [planId]);
```

### Sync Behavior

- **Automatic**: Providers sync changes automatically, no manual intervention
- **Incremental**: Only deltas are sent over the network (efficient)
- **Resilient**: Handles network disconnections, reconnects automatically
- **Eventually consistent**: All peers converge to the same state

---

## URL Snapshots vs Y.Doc State

### Mental Model

```
┌──────────────────────────────────────────────────────────────┐
│                     DATA HIERARCHY                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  SOURCE OF TRUTH: Y.Doc (Distributed CRDT)                   │
│  ├── Browser A: IndexedDB                                    │
│  ├── Browser B: IndexedDB                                    │
│  └── MCP Server: In-memory Y.Doc                             │
│                                                              │
│  SNAPSHOTS: URLs (Materialized Views)                        │
│  ├── Generated from current Y.Doc state                      │
│  ├── Compressed JSON (lz-string)                             │
│  ├── Used for sharing and bootstrapping new peers            │
│  └── Not authoritative (Y.Doc is)                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### What are URL Snapshots?

URL snapshots are **compressed JSON representations** of a plan's state at a point in time. They're:
- **Portable**: Can be shared via Slack, bookmarks, GitHub comments
- **Self-contained**: Include all data needed to bootstrap a new peer
- **Immutable**: Once created, they don't change
- **Optional**: Y.Doc is the source of truth, URLs are convenience

### URL Structure

```
https://org.github.io/shipyard?d={compressed-data}

Where compressed-data = lz-string.compressToEncodedURIComponent(JSON.stringify({
  v: 1,                              // Schema version
  id: 'plan-abc123',                 // Plan ID
  title: 'Add Authentication',       // Plan title
  status: 'draft',                   // Current status
  repo: 'org/repo',                  // GitHub repo
  pr: 42,                            // PR number
  content: [...],                    // BlockNote blocks (JSON)
  artifacts: [...],                  // Artifact references
  comments: [...]                    // Comments (optional)
}))
```

Example:

```
https://shipyard.app/?d=NobwRAhg9gxgLgS2A...
                       ^^^^^^^^^^^^^^^^^^^^^^^^
                       Compressed plan data
```

### Hydration Flow

When a browser opens a URL, here's what happens:

```
1. Parse URL → Extract 'd' parameter
2. Decompress → lz-string.decompressFromEncodedURIComponent()
3. Parse JSON → Get UrlEncodedPlan object
4. Initialize Y.Doc
5. Create metadata → ydoc.getMap('metadata').set(...)
6. Create BlockNote content → Pass to BlockNote editor
7. (Optional) Restore comments → Pass to YjsThreadStore
8. Connect sync providers (WebSocket, IndexedDB, WebRTC)
9. CRDT sync takes over → URL data is now just initial state
```

### Code Example: Hydration

See [Code Examples](#code-examples) section for full implementation.

### Key Differences

| Aspect | Y.Doc | URL Snapshot |
|--------|-------|--------------|
| **Purpose** | Source of truth | Bootstrap mechanism |
| **Mutability** | Constantly evolving | Immutable once created |
| **Scope** | All collaborative state | Snapshot at point in time |
| **Sync** | Real-time CRDT sync | One-way load only |
| **Persistence** | IndexedDB, peers | Browser history, bookmarks |
| **Size** | Full CRDT history | Compressed current state |

### When to Generate URL Snapshots

Generate a new URL snapshot when:
- User clicks "Share Plan" button
- Plan reaches a milestone (e.g., approved)
- User wants to bookmark current state
- Creating a recovery point before major changes

**Don't** regenerate URLs constantly - they're snapshots, not live links.

---

## Code Examples

### Example 1: Initialize a New Plan

```typescript
import * as Y from 'yjs';
import { initPlanMetadata } from '@shipyard/schema/yjs';

// Create a new Y.Doc
const ydoc = new Y.Doc();

// Initialize metadata
initPlanMetadata(ydoc, {
  id: 'plan-abc123',
  title: 'Add User Authentication',
  status: 'draft',
  repo: 'myorg/myrepo',
  pr: 42,
});

// Metadata is now in ydoc.getMap('metadata')
// BlockNote content will be added via editor
// Comments will be added via YjsThreadStore
```

### Example 2: Read Plan Metadata

```typescript
import { getPlanMetadata } from '@shipyard/schema/yjs';

const metadata = getPlanMetadata(ydoc);

if (metadata) {
  console.log('Plan ID:', metadata.id);
  console.log('Title:', metadata.title);
  console.log('Status:', metadata.status);
  console.log('Created:', new Date(metadata.createdAt));
} else {
  console.error('Invalid or missing metadata');
}
```

### Example 3: Update Plan Metadata

```typescript
import { setPlanMetadata } from '@shipyard/schema/yjs';

// Update status
setPlanMetadata(ydoc, {
  status: 'pending_review',
});

// Update multiple fields
setPlanMetadata(ydoc, {
  title: 'Add OAuth2 Authentication',
  status: 'approved',
});

// updatedAt is automatically set
```

### Example 4: Observe Metadata Changes

```typescript
const metadataMap = ydoc.getMap('metadata');

metadataMap.observe((event) => {
  console.log('Metadata changed:');

  for (const [key, change] of event.changes.keys) {
    console.log(`  ${key}:`, change.action, change.newValue);
  }

  // Re-validate after changes
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) {
    console.error('Metadata is now invalid!');
  }
});
```

### Example 5: Hydrate from URL Snapshot

```typescript
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { getPlanFromUrl, initPlanMetadata } from '@shipyard/schema';
import { useCreateBlockNote } from '@blocknote/react';

function usePlanWithHydration() {
  const [ydoc] = useState(() => new Y.Doc());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // 1. Get URL snapshot
    const urlPlan = getPlanFromUrl();
    if (!urlPlan) {
      console.error('No plan in URL');
      return;
    }

    const planId = urlPlan.id;

    // 2. Set up IndexedDB persistence (loads existing state if any)
    const indexeddbProvider = new IndexeddbPersistence(planId, ydoc);

    indexeddbProvider.once('synced', () => {
      // 3. Check if Y.Doc is empty (first load)
      const metadata = ydoc.getMap('metadata');

      if (metadata.size === 0) {
        // 4. Hydrate from URL snapshot
        console.log('First load - hydrating from URL');

        initPlanMetadata(ydoc, {
          id: urlPlan.id,
          title: urlPlan.title,
          status: urlPlan.status as any,
          repo: urlPlan.repo,
          pr: urlPlan.pr,
        });

        // BlockNote content will be initialized separately
        // (pass urlPlan.content to BlockNote editor)
      } else {
        console.log('Existing state loaded from IndexedDB');
      }

      setIsHydrated(true);
    });

    // 5. Connect to WebSocket server
    const wsProvider = new WebsocketProvider(
      'ws://localhost:3000',
      planId,
      ydoc
    );

    wsProvider.on('sync', (isSynced: boolean) => {
      console.log('WebSocket sync:', isSynced);
    });

    return () => {
      wsProvider.destroy();
      indexeddbProvider.destroy();
    };
  }, [ydoc]);

  return { ydoc, isHydrated };
}
```

### Example 6: Full Editor Setup with Comments

```typescript
import { useCreateBlockNote } from '@blocknote/react';
import { YjsThreadStore } from '@blocknote/react';

function PlanEditor() {
  const { ydoc, isHydrated } = usePlanWithHydration();
  const urlPlan = getPlanFromUrl();

  const editor = useCreateBlockNote({
    collaboration: {
      provider: ydoc,
      fragment: ydoc.getXmlFragment('document'),
      user: {
        name: 'Alice',
        color: '#3b82f6',
      },
    },
    // Initialize with URL content if first load
    initialContent: isHydrated ? undefined : urlPlan?.content,
  });

  const threadStore = YjsThreadStore.create(ydoc);

  if (!isHydrated) {
    return <div>Loading plan...</div>;
  }

  return (
    <BlockNoteView
      editor={editor}
      threads={threadStore}
    />
  );
}
```

### Example 7: Generate URL Snapshot

```typescript
import { createPlanUrl, encodePlan } from '@shipyard/schema/url';
import { getPlanMetadata } from '@shipyard/schema/yjs';

function generateShareableUrl(ydoc: Y.Doc, editor: BlockNoteEditor): string {
  // 1. Get current metadata
  const metadata = getPlanMetadata(ydoc);
  if (!metadata) throw new Error('Invalid metadata');

  // 2. Get current BlockNote content
  const content = editor.document; // Array of Block objects

  // 3. (Optional) Get comments
  // const threads = threadStore.getThreads();

  // 4. Create snapshot
  const snapshot = {
    v: 1 as const,
    id: metadata.id,
    title: metadata.title,
    status: metadata.status,
    repo: metadata.repo,
    pr: metadata.pr,
    content: content,
    // comments: threads, // Optional
  };

  // 5. Generate URL
  const url = createPlanUrl('https://shipyard.app', snapshot);

  return url;
}

// Usage
const shareableUrl = generateShareableUrl(ydoc, editor);
navigator.clipboard.writeText(shareableUrl);
console.log('Copied to clipboard:', shareableUrl);
```

### Example 8: Monitor Sync Status

```typescript
function useSyncStatus(ydoc: Y.Doc, planId: string) {
  const [status, setStatus] = useState({
    indexeddb: false,
    websocket: false,
    webrtc: false,
  });

  useEffect(() => {
    const indexeddbProvider = new IndexeddbPersistence(planId, ydoc);
    const wsProvider = new WebsocketProvider('ws://localhost:3000', planId, ydoc);
    const webrtcProvider = new WebrtcProvider(planId, ydoc);

    indexeddbProvider.on('synced', () => {
      setStatus(prev => ({ ...prev, indexeddb: true }));
    });

    wsProvider.on('sync', (isSynced: boolean) => {
      setStatus(prev => ({ ...prev, websocket: isSynced }));
    });

    webrtcProvider.on('synced', () => {
      setStatus(prev => ({ ...prev, webrtc: true }));
    });

    return () => {
      indexeddbProvider.destroy();
      wsProvider.destroy();
      webrtcProvider.destroy();
    };
  }, [ydoc, planId]);

  return status;
}

// Usage in UI
function SyncIndicator() {
  const { ydoc } = usePlan();
  const planId = getPlanMetadata(ydoc)?.id ?? 'unknown';
  const status = useSyncStatus(ydoc, planId);

  return (
    <div>
      <span>IndexedDB: {status.indexeddb ? '✓' : '⏳'}</span>
      <span>Server: {status.websocket ? '✓' : '⏳'}</span>
      <span>Peers: {status.webrtc ? '✓' : '⏳'}</span>
    </div>
  );
}
```

---

## Migration Path

### Schema Versioning Strategy

Shipyard uses explicit versioning for both URL snapshots and Y.Doc metadata.

### URL Snapshot Versioning

```typescript
interface UrlEncodedPlan {
  v: 1;  // Version field
  // ... rest of plan data
}

function decodePlan(encoded: string): UrlEncodedPlan | null {
  const plan = JSON.parse(decompressed);

  // Handle different versions
  if (plan.v === 1) {
    return plan;
  } else if (plan.v === 2) {
    // Transform v2 → v1 format for backwards compat
    return migrateV2ToV1(plan);
  } else {
    console.warn('Unknown plan version:', plan.v);
    // Try to handle gracefully
    return plan;
  }
}
```

### Y.Doc Metadata Versioning

Since Y.Maps don't have built-in versioning, we handle it at the application level:

```typescript
// Current schema (v1)
interface PlanMetadata {
  id: string;
  title: string;
  status: 'draft' | 'pending_review' | 'approved' | 'changes_requested';
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
}
```

### Adding New Fields (Non-Breaking)

Adding optional fields is safe:

```typescript
// New schema (v2) - backwards compatible
interface PlanMetadata {
  id: string;
  title: string;
  status: 'draft' | 'pending_review' | 'approved' | 'changes_requested';
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;

  // NEW: Optional fields
  assignee?: string;        // Safe to add
  dueDate?: number;         // Safe to add
  tags?: string[];          // Safe to add
}
```

**Migration code**:

```typescript
// Read helper is backwards compatible
export function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null {
  const map = ydoc.getMap('metadata');
  const data = map.toJSON();

  // Zod schema now includes optional fields
  const result = PlanMetadataSchema.safeParse(data);
  return result.success ? result.data : null;
}

// Old Y.Docs without new fields will still validate
// New Y.Docs with new fields will validate and include them
```

### Changing Required Fields (Breaking)

Changing required fields requires careful migration:

```typescript
// BREAKING: Renaming 'status' to 'state'
interface PlanMetadataV2 {
  id: string;
  title: string;
  state: 'draft' | 'review' | 'approved' | 'rejected';  // NEW
  // status: removed
  // ...
}
```

**Migration strategy**:

```typescript
export function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null {
  const map = ydoc.getMap('metadata');
  const data = map.toJSON();

  // Check if this is an old document
  if ('status' in data && !('state' in data)) {
    // Migrate: status → state
    data.state = migrateStatus(data.status);
    delete data.status;

    // Write back migrated data
    map.set('state', data.state);
    map.delete('status');
  }

  const result = PlanMetadataSchemaV2.safeParse(data);
  return result.success ? result.data : null;
}

function migrateStatus(oldStatus: string): string {
  const mapping = {
    'pending_review': 'review',
    'changes_requested': 'rejected',
    // ... rest of mappings
  };
  return mapping[oldStatus] || oldStatus;
}
```

### Migration Checklist

When changing the schema:

- [ ] **Add version field** if not present
- [ ] **Write migration function** for breaking changes
- [ ] **Test with old documents** to ensure backwards compatibility
- [ ] **Update Zod schemas** to match new types
- [ ] **Update yjs-helpers.ts** with migration logic
- [ ] **Document breaking changes** in changelog
- [ ] **Consider gradual rollout** (support both old and new for a period)

### Best Practices for Schema Evolution

1. **Prefer additive changes**: Add optional fields instead of removing/renaming
2. **Version everything**: Include version field in all serialized data
3. **Migrate lazily**: Only migrate on read, not proactively
4. **Validate always**: Use Zod to catch unexpected schema violations
5. **Fallback gracefully**: Handle unknown versions without crashing
6. **Test migrations**: Write tests for each migration path
7. **Document clearly**: Explain why changes were made and how to migrate

---

## Best Practices

### Do's

1. **Use type-safe helpers**: Always use `getPlanMetadata()`, `setPlanMetadata()`, etc.
2. **Validate on read**: Use Zod schemas to validate Y.Map data
3. **Let BlockNote manage content**: Don't manipulate `ydoc.getXmlFragment('document')` directly
4. **Clean up providers**: Always call `.destroy()` on unmount
5. **Handle offline gracefully**: Show UI indicators when sync is unavailable
6. **Version your schemas**: Include version fields for future compatibility
7. **Observe changes**: Use `.observe()` to react to remote changes
8. **Test migrations**: Write tests for schema migrations

### Don'ts

1. **Don't mutate Y.Map directly without helpers**: Bypasses validation
2. **Don't assume sync is instant**: Handle eventual consistency
3. **Don't store large blobs in Y.Doc**: Use external storage (GitHub artifacts)
4. **Don't delete Y.Doc state**: Use status flags instead (e.g., `archived: true`)
5. **Don't forget to update `updatedAt`**: Use `setPlanMetadata()` which does this
6. **Don't rely on URL as source of truth**: It's a snapshot, not live state
7. **Don't block on sync**: Show optimistic UI updates
8. **Don't ignore validation errors**: Log and handle them

### Common Pitfalls

**Pitfall 1: Forgetting to clean up providers**

```typescript
// ❌ BAD: Providers leak
useEffect(() => {
  const wsProvider = new WebsocketProvider('ws://localhost:3000', planId, ydoc);
  // Missing cleanup!
}, []);

// ✅ GOOD: Cleanup on unmount
useEffect(() => {
  const wsProvider = new WebsocketProvider('ws://localhost:3000', planId, ydoc);
  return () => wsProvider.destroy();
}, [planId, ydoc]);
```

**Pitfall 2: Directly mutating Y.Map**

```typescript
// ❌ BAD: No validation, no updatedAt
const map = ydoc.getMap('metadata');
map.set('status', 'approved');

// ✅ GOOD: Type-safe, validated, updatedAt handled
setPlanMetadata(ydoc, { status: 'approved' });
```

**Pitfall 3: Assuming instant sync**

```typescript
// ❌ BAD: Assumes other peers see change immediately
setPlanMetadata(ydoc, { status: 'approved' });
alert('All peers now see approved status!'); // Not guaranteed!

// ✅ GOOD: Use observers to react to changes
ydoc.getMap('metadata').observe(() => {
  const metadata = getPlanMetadata(ydoc);
  if (metadata?.status === 'approved') {
    console.log('Status is now approved (locally or remotely)');
  }
});
```

**Pitfall 4: Storing too much data in Y.Doc**

```typescript
// ❌ BAD: Large binary blob in Y.Map
map.set('screenshot', base64Image); // Bloats Y.Doc and sync traffic

// ✅ GOOD: Store reference, not data
const artifact = {
  id: 'art-123',
  type: 'screenshot',
  filename: 'login-ui.png',
  url: getArtifactUrl(repo, pr, planId, 'login-ui.png'),
};
// Actual image is stored in GitHub
```

### Performance Tips

1. **Use transactions for bulk updates**:
   ```typescript
   ydoc.transact(() => {
     setPlanMetadata(ydoc, { title: 'New Title' });
     setPlanMetadata(ydoc, { status: 'approved' });
   });
   // Only one sync event, not two
   ```

2. **Debounce observers**:
   ```typescript
   const debouncedHandler = debounce(() => {
     const metadata = getPlanMetadata(ydoc);
     console.log('Metadata:', metadata);
   }, 300);

   ydoc.getMap('metadata').observe(debouncedHandler);
   ```

3. **Unobserve when not needed**:
   ```typescript
   const handler = () => { /* ... */ };
   metadataMap.observe(handler);

   // Later...
   metadataMap.unobserve(handler);
   ```

---

## Summary

Shipyard's Yjs data model provides:

- **Three-part structure**: BlockNote content, Plan metadata, Comments/Threads
- **Clear ownership**: BlockNote manages content/comments, we manage metadata
- **Type safety**: Zod validation + TypeScript wrappers around Y.Map
- **Multi-provider sync**: WebSocket (server), IndexedDB (persistence), WebRTC (P2P)
- **URL snapshots**: Materialized views for sharing, not source of truth
- **Migration path**: Schema versioning and lazy migration on read

### Key Files

- [`packages/schema/src/yjs-helpers.ts`](../packages/schema/src/yjs-helpers.ts) - Type-safe Y.Map helpers
- [`packages/schema/src/plan.ts`](../packages/schema/src/plan.ts) - PlanMetadata schema
- [`packages/schema/src/url-encoding.ts`](../packages/schema/src/url-encoding.ts) - URL snapshot utilities
- [`docs/decisions/0001-use-yjs-not-loro.md`](./decisions/0001-use-yjs-not-loro.md) - Why Yjs?
- [`docs/architecture.md`](./architecture.md) - Overall architecture
- [`docs/milestones/03-live-sync.md`](./milestones/03-live-sync.md) - Sync implementation plan

### Next Steps

1. Read [ADR-0001](./decisions/0001-use-yjs-not-loro.md) for decision context
2. Review [yjs-helpers.ts](../packages/schema/src/yjs-helpers.ts) for API details
3. Explore [Milestone 3](./milestones/03-live-sync.md) for sync implementation
4. Check [BlockNote docs](https://www.blocknotejs.org/docs/features/collaboration) for editor integration

---

*Last updated: 2026-01-03*
