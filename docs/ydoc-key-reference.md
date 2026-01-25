# Y.Doc Key Reference

Quick reference for all Y.Doc keys used in shipyard.

## Import

```typescript
import { YDOC_KEYS } from '@shipyard/schema';
```

## Keys Overview

| Constant | String Value | Type | Purpose |
|----------|--------------|------|---------|
| `YDOC_KEYS.METADATA` | `'metadata'` | Y.Map | Task metadata (id, title, status, etc.) |
| `YDOC_KEYS.CONTENT` | `'content'` | Y.Array | BlockNote blocks as JSON (for snapshots) |
| `YDOC_KEYS.DOCUMENT_FRAGMENT` | `'document'` | Y.XmlFragment | BlockNote editor structure (for collaboration) |
| `YDOC_KEYS.THREADS` | `'threads'` | Y.Map | Comment threads (managed by BlockNote) |
| `YDOC_KEYS.STEP_COMPLETIONS` | `'stepCompletions'` | Y.Map | Checklist completion status |
| `YDOC_KEYS.PLANS` | `'plans'` | Y.Map | Task index (only in index doc) |

## Usage Examples

### Reading Metadata
```typescript
import { YDOC_KEYS, getPlanMetadata } from '@shipyard/schema';

// Option 1: Use helper function (recommended)
const metadata = getPlanMetadata(ydoc);

// Option 2: Direct access
const metaMap = ydoc.getMap(YDOC_KEYS.METADATA);
const status = metaMap.get('status');
```

### Updating Metadata
```typescript
import { YDOC_KEYS } from '@shipyard/schema';

ydoc.transact(() => {
  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);
  metadata.set('status', 'approved');
  metadata.set('reviewedAt', Date.now());
  metadata.set('updatedAt', Date.now());
});
```

### Reading Content Array
```typescript
import { YDOC_KEYS } from '@shipyard/schema';

const contentArray = ydoc.getArray(YDOC_KEYS.CONTENT);
const blocks = contentArray.toJSON();
```

### BlockNote Collaboration
```typescript
import { YDOC_KEYS } from '@shipyard/schema';
import { useCreateBlockNote } from '@blocknote/react';

const editor = useCreateBlockNote({
  collaboration: {
    provider: wsProvider,
    // CRITICAL: Must use DOCUMENT_FRAGMENT, not CONTENT!
    fragment: ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT),
    user: { name: 'Alice', color: '#ff0000' },
  },
});
```

### Comment Threads
```typescript
import { YDOC_KEYS } from '@shipyard/schema';
import { YjsThreadStore } from '@blocknote/core/comments';

// Initialize thread store
const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
const threadStore = new YjsThreadStore(userId, threadsMap, auth);

// Read threads
const threadsData = threadsMap.toJSON();
const threads = parseThreads(threadsData);
```

### Step Completions
```typescript
import { YDOC_KEYS, toggleStepCompletion } from '@shipyard/schema';

// Toggle a step
toggleStepCompletion(ydoc, 'step-123');

// Check if completed
const steps = ydoc.getMap(YDOC_KEYS.STEP_COMPLETIONS);
const isCompleted = steps.get('step-123') || false;
```

### Task Index
```typescript
import { YDOC_KEYS, getPlanIndex } from '@shipyard/schema';

// Get all tasks (only in index doc!)
const tasks = getPlanIndex(indexDoc);

// Direct access
const tasksMap = indexDoc.getMap(YDOC_KEYS.PLANS);
const taskEntry = tasksMap.get(taskId);
```

## Critical: Content vs Document Fragment

**Problem:** Why do we have both `CONTENT` and `DOCUMENT_FRAGMENT`?

**Answer:** They serve different purposes:

### CONTENT (`'content'`)
- **Type:** Y.Array<Block>
- **Format:** JSON array of BlockNote blocks
- **Purpose:**
  - Serialization for URL snapshots
  - MCP tool access (read_task)
  - Easy to convert to/from JSON
- **Not used for:** Real-time editing

### DOCUMENT_FRAGMENT (`'document'`)
- **Type:** Y.XmlFragment
- **Format:** ProseMirror document structure
- **Purpose:**
  - Real-time collaborative editing
  - BlockNote's native format
  - Required for collaboration
- **Not used for:** Serialization

### Sync Strategy

```typescript
// SERVER: Create both on task creation
ydoc.transact(() => {
  // 1. JSON array for snapshots
  const contentArray = ydoc.getArray(YDOC_KEYS.CONTENT);
  contentArray.push(blocks);

  // 2. XmlFragment for editing
  const fragment = ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT);
  editor.blocksToYXmlFragment(blocks, fragment);
});

// BROWSER: BlockNote reads from DOCUMENT_FRAGMENT
const editor = useCreateBlockNote({
  collaboration: {
    fragment: ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT), // ✅
    // NOT: ydoc.getArray(YDOC_KEYS.CONTENT) // ❌
  },
});
```

**Rule:**
- Server writes to BOTH
- Browser reads DOCUMENT_FRAGMENT for editing
- Browser reads CONTENT for snapshots/fallback

## Validation

```typescript
import { isValidYDocKey } from '@shipyard/schema';

const key = 'metadata';
if (isValidYDocKey(key)) {
  // TypeScript knows key is YDocKey here
  const map = ydoc.getMap(key);
}
```

## Where Keys Are Used

### Server Side
- `/apps/server/src/tools/create-plan.ts` (creates tasks)
  - Writes: METADATA, CONTENT, DOCUMENT_FRAGMENT
- `/apps/server/src/tools/read-plan.ts` (reads tasks)
  - Reads: METADATA, CONTENT
- `/apps/server/src/tools/get-feedback.ts`
  - Reads: METADATA, THREADS

### Browser Side
- `/apps/web/src/components/PlanViewer.tsx` (renders task content)
  - Reads: DOCUMENT_FRAGMENT (BlockNote), THREADS
- `/apps/web/src/components/CommentsPanel.tsx`
  - Reads: THREADS
- `/apps/web/src/components/ReviewActions.tsx`
  - Writes: METADATA (status, reviewedAt, reviewedBy)
- `/apps/web/src/pages/PlanPage.tsx` (task detail page)
  - Reads: METADATA, CONTENT (fallback)
- `/apps/web/src/hooks/useHydration.ts`
  - Writes: METADATA, CONTENT
- `/apps/web/src/hooks/usePlanIndex.ts` (task list)
  - Reads: PLANS

### Schema Helpers
- `/packages/schema/src/yjs-helpers.ts`
  - All keys via helper functions
- `/packages/schema/src/plan-index-helpers.ts`
  - PLANS key

## Best Practices

### ✅ DO
```typescript
// Use constants
import { YDOC_KEYS } from '@shipyard/schema';
const metadata = ydoc.getMap(YDOC_KEYS.METADATA);

// Use helper functions
import { getPlanMetadata } from '@shipyard/schema';
const metadata = getPlanMetadata(ydoc);

// Use transactions for multiple updates
ydoc.transact(() => {
  metadata.set('status', 'approved');
  metadata.set('updatedAt', Date.now());
});
```

### ❌ DON'T
```typescript
// Hard-code strings (typo-prone)
const metadata = ydoc.getMap('metadata');

// Wrong key for BlockNote
const fragment = ydoc.getArray('content'); // ❌ Should be getXmlFragment('document')

// Multiple transactions
metadata.set('status', 'approved'); // Transaction 1
metadata.set('updatedAt', Date.now()); // Transaction 2 (triggers observers twice!)
```

## Migration Checklist

If you're refactoring old code:

- [ ] Replace `'metadata'` with `YDOC_KEYS.METADATA`
- [ ] Replace `'content'` with `YDOC_KEYS.CONTENT`
- [ ] Replace `'document'` with `YDOC_KEYS.DOCUMENT_FRAGMENT`
- [ ] Replace `'threads'` with `YDOC_KEYS.THREADS`
- [ ] Replace `'stepCompletions'` with `YDOC_KEYS.STEP_COMPLETIONS`
- [ ] Replace `'plans'` with `YDOC_KEYS.PLANS`
- [ ] Verify BlockNote uses DOCUMENT_FRAGMENT, not CONTENT
- [ ] Add import: `import { YDOC_KEYS } from '@shipyard/schema';`

## See Also

- [Y.Doc Data Model](./yjs-data-model.md) - Detailed explanation
- [Y.Doc Key Audit](../YDOC_KEY_AUDIT.md) - Full audit report
- Source: [packages/schema/src/yjs-keys.ts](../packages/schema/src/yjs-keys.ts)
