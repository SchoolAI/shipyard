# Milestone 3: Live Sync

**Status**: Not Started
**Goal**: Real-time sync between MCP server and browser

---

## Overview

Add loro-extended sync so that:
1. MCP server and browser share CRDT state
2. Changes propagate in real-time
3. Browser persists state in IndexedDB

This is where the app becomes truly collaborative.

---

## Deliverables

### 3a: MCP Server WebSocket

- [ ] Add `@loro-extended/adapter-websocket` (server)
- [ ] Create `Repo` with WebSocket adapter
- [ ] Handle connections from browser clients
- [ ] Hydrate CRDT from URL-encoded plan on creation

### 3b: Browser WebSocket Client

- [ ] Add `@loro-extended/adapter-websocket` (client)
- [ ] Add `@loro-extended/adapter-indexeddb` for persistence
- [ ] Connect to MCP server on localhost
- [ ] Hydrate from URL, then sync live state

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

### MCP Server with loro-extended

```typescript
import { Repo } from "@loro-extended/repo";
import { WsServerNetworkAdapter, wrapWsSocket } from "@loro-extended/adapter-websocket/server";
import { WebSocketServer } from "ws";

const wsAdapter = new WsServerNetworkAdapter();
const repo = new Repo({ adapters: [wsAdapter] });

const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
  const { start } = wsAdapter.handleConnection({
    socket: wrapWsSocket(ws),
  });
  start();
});
```

### Browser with Multiple Adapters

```typescript
import { RepoProvider } from "@loro-extended/react";
import { WsClientNetworkAdapter } from "@loro-extended/adapter-websocket/client";
import { IndexedDBStorageAdapter } from "@loro-extended/adapter-indexeddb";

const wsAdapter = new WsClientNetworkAdapter({
  url: `ws://localhost:${WS_PORT}`,
});
const storageAdapter = new IndexedDBStorageAdapter();

<RepoProvider config={{ adapters: [wsAdapter, storageAdapter] }}>
  <App />
</RepoProvider>
```

### Hydration Pattern

```typescript
function usePlan(urlPlan: UrlEncodedPlan) {
  const handle = useHandle(urlPlan.id, LiveStateSchema);

  // On first load, hydrate from URL if CRDT is empty
  useEffect(() => {
    if (handle.doc.toJSON().planId === '') {
      handle.change(draft => {
        draft.planId = urlPlan.id;
        // Initialize step status from URL
        urlPlan.steps.forEach(step => {
          draft.stepStatus.set(step.id, false);
        });
      });
    }
  }, []);

  return handle;
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
