# Milestone 3: Live Sync

**Status**: Not Started
**Goal**: Real-time sync between MCP server and browser

---

## Overview

Add Yjs sync so that:
1. MCP server and browser share CRDT state (Y.Doc)
2. Changes propagate in real-time via y-websocket
3. Browser persists state in IndexedDB via y-indexeddb

This is where the app becomes truly collaborative.

---

## Deliverables

### 3a: MCP Server WebSocket

- [ ] Add `y-websocket` server
- [ ] Manage Y.Doc instances for each plan
- [ ] Handle connections from browser clients
- [ ] Sync Y.Doc updates between server and browsers

### 3b: Browser WebSocket Client

- [ ] Add `y-websocket` provider
- [ ] Add `y-indexeddb` for persistence
- [ ] Connect to MCP server on localhost
- [ ] Hydrate from URL, then sync live state via Yjs

### 3c: State Hydration Flow

```
1. Browser loads URL
2. Decode plan from URL → initial state
3. Connect WebSocket to MCP server
4. Sync CRDT state
5. URL state + CRDT delta = current state
```

- [ ] Implement hydration logic
- [ ] Handle offline gracefully (show URL state)
- [ ] Show sync status indicator

### 3d: Interactive UI

- [ ] Step checkboxes become clickable
- [ ] Toggling step done syncs to server
- [ ] Server sees changes immediately

---

## Demo Checkpoint

**Scenario**: Changes sync in real-time

```
1. Agent creates plan (Milestone 1)
2. Browser opens with plan
3. User toggles "Create auth middleware" as done
4. MCP server immediately sees the change
5. (Bonus: Open in second browser tab, see it sync)
```

---

## Success Criteria

1. Toggle step in browser → server sees it
2. Multiple browser tabs stay in sync
3. Refresh browser → state persists (IndexedDB)
4. Offline → shows URL state with "offline" indicator

---

## Technical Notes

### MCP Server with y-websocket

```typescript
import * as Y from 'yjs';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const wss = new WebSocketServer({ port: WS_PORT });

// Store Y.Docs for each plan
const docs = new Map<string, Y.Doc>();

wss.on('connection', (ws, req) => {
  // y-websocket handles sync automatically
  setupWSConnection(ws, req, {
    docName: req.url?.slice(1) || 'default', // Plan ID from URL
    gc: true
  });
});
```

### Browser with y-websocket + y-indexeddb

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

function usePlan(planId: string) {
  const [ydoc] = useState(() => new Y.Doc());

  useEffect(() => {
    // WebSocket sync with MCP server
    const wsProvider = new WebsocketProvider(
      `ws://localhost:${WS_PORT}`,
      planId,
      ydoc
    );

    // IndexedDB persistence
    const indexeddbProvider = new IndexeddbPersistence(planId, ydoc);

    return () => {
      wsProvider.destroy();
      indexeddbProvider.destroy();
    };
  }, [planId, ydoc]);

  return ydoc;
}
```

### Hydration Pattern

```typescript
function usePlanWithHydration(urlPlan: UrlEncodedPlan) {
  const ydoc = usePlan(urlPlan.id);

  useEffect(() => {
    // On first load, hydrate from URL if Y.Doc is empty
    const metadata = ydoc.getMap('metadata');

    if (metadata.size === 0) {
      // Initialize from URL snapshot
      initPlanMetadata(ydoc, {
        id: urlPlan.id,
        title: urlPlan.title,
        status: urlPlan.status as any,
        repo: urlPlan.repo,
        pr: urlPlan.pr,
      });

      // Initialize BlockNote content from URL
      const documentFragment = ydoc.getXmlFragment('document');
      // BlockNote will handle this via its editor (using initialContent)
    }
  }, [ydoc, urlPlan]);

  return ydoc;
}
```

---

## Dependencies

- Milestone 0 (schemas)
- Milestone 1 (MCP server)
- Milestone 2 (web UI)

## Blocks

- Milestone 4 (Review Flow) - builds on sync

---

*Created: 2026-01-02*
