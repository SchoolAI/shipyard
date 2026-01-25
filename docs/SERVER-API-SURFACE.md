# Server API Surface Area

Complete inventory of all server endpoints and access patterns.

---

## Overview

Shipyard has **3 server surfaces** that browsers can access:

| Surface | Access Pattern | Port | Purpose |
|---------|---------------|------|---------|
| **Registry Server** | HTTP API | 32191/32192 | Session discovery, plan status, hook API |
| **WebSocket Server** | WebSocket (y-websocket) | Dynamic (per session) | Y.Doc CRDT sync |
| **MCP Server** | MCP protocol (stdio) | N/A | Agent tools (browser can't access) |

---

## 1. Registry Server (HTTP API)

**Base URL:** `http://localhost:32191` or `http://localhost:32192`

**Purpose:** Session registry, plan status, and hook integration

### Session Discovery

| Endpoint | Method | Purpose | Browser Access |
|----------|--------|---------|----------------|
| `/registry` | GET | List all active MCP sessions | ✅ YES |
| `/register` | POST | Register new MCP session | ❌ Internal only |
| `/unregister` | DELETE | Unregister MCP session | ❌ Internal only |

**Example:**
```javascript
// Browser: Discover all MCP sessions
const res = await fetch('http://localhost:32191/registry');
const { servers } = await res.json();
// [{ port: 49184, pid: 20410, url: "ws://localhost:49184" }]
```

### Plan Status & Subscription

| Endpoint | Method | Purpose | Browser Access |
|----------|--------|---------|----------------|
| `/api/plan/:id/status` | GET | Get plan approval status | ✅ YES |
| `/api/plan/:id/subscribe` | POST | Subscribe to status changes | ✅ YES |
| `/api/plan/:id/changes` | GET | Get plan change events | ✅ YES |
| `/api/plan/:id/unsubscribe` | DELETE | Unsubscribe from changes | ✅ YES |

**Use case:** Browser polls for plan approval status (used by hook)

### GitHub Integration

| Endpoint | Method | Purpose | Browser Access |
|----------|--------|---------|----------------|
| `/api/plans/:id/pr-diff/:prNumber` | GET | Get PR diff content | ✅ YES |
| `/api/plans/:id/pr-files/:prNumber` | GET | Get PR file list | ✅ YES |

**Use case:** Browser renders PR diffs without GitHub API calls

### Hook API

| Endpoint | Method | Purpose | Browser Access |
|----------|--------|---------|----------------|
| `/api/hook/session` | POST | Create plan from hook | ❌ Hook only |
| `/api/hook/plan/:id/content` | PUT | Update plan content | ❌ Hook only |
| `/api/hook/plan/:id/review` | GET | Get review status | ❌ Hook only |
| `/api/hook/plan/:id/session-token` | POST | Set session token | ❌ Hook only |
| `/api/hook/plan/:id/presence` | POST | Update agent presence | ❌ Hook only |
| `/api/hook/plan/:id/presence` | DELETE | Clear agent presence | ❌ Hook only |

**Note:** Browser COULD call these, but they're designed for hook integration

### Input Request Response Formats

For details on how user responses are serialized for each input type (text, multiline, choice, confirm), see **[docs/INPUT-RESPONSE-FORMATS.md](./INPUT-RESPONSE-FORMATS.md)**

---

## 2. WebSocket Server (Y.Doc Sync)

**URL Pattern:** `ws://localhost:{dynamic-port}` (discovered via registry)

**Purpose:** Real-time Y.Doc CRDT synchronization

**Protocol:** y-websocket binary protocol (NOT JSON)

**Browser Access:** ✅ YES (this is the primary sync mechanism)

**Example:**
```javascript
import { WebsocketProvider } from 'y-websocket';

// Browser: Connect to specific plan's Y.Doc
const provider = new WebsocketProvider(
  'localhost',
  planId,
  ydoc,
  { WebSocketPolyfill: undefined, connect: true }
);

// Discover WebSocket URL from registry
const registry = await fetch('http://localhost:32191/registry').then(r => r.json());
const wsUrl = registry.servers[0].url; // ws://localhost:49184
```

---

## 3. MCP Server (Agent Tools)

**Protocol:** JSON-RPC over stdio

**Browser Access:** ❌ NO (stdio transport only works for local processes)

**Available Tools:**
- `execute_code` - Execute TypeScript code with access to Shipyard APIs

**Note:** Browser CANNOT call MCP tools directly. Only local AI agents (Claude Code, Cursor, etc.) can.

---

## Architecture for "Import to Claude Session"

Given the constraints, here are the options:

### Option A: Add HTTP Endpoint to Registry Server (Recommended for Local Development)

**Endpoint:** `POST /api/conversation/import`

**Request:**
```json
{
  "a2aMessages": [...],
  "meta": {
    "sourcePlatform": "claude-code",
    "sourceSessionId": "abc-123",
    "planId": "xyz"
  }
}
```

**Response:**
```json
{
  "sessionId": "new-session-uuid",
  "transcriptPath": "~/.claude/projects/.../new-session.jsonl",
  "messageCount": 245
}
```

**Implementation:**
```typescript
// apps/server/src/registry-server.ts

app.post('/api/conversation/import', async (req, res) => {
  const { a2aMessages, meta } = req.body;

  // Convert A2A → Claude Code JSONL
  const jsonl = convertA2AToClaudeCode(a2aMessages);

  // Write to new session file
  const sessionId = nanoid();
  const projectPath = '~/.claude/projects/shipyard'; // Or detect from cwd
  const transcriptPath = `${projectPath}/${sessionId}.jsonl`;

  await writeFile(transcriptPath, jsonl, 'utf-8');

  res.json({ sessionId, transcriptPath, messageCount: a2aMessages.length });
});
```

**Pros:**
- Browser can call directly (no MCP needed)
- Works for any user with registry server running
- Simple HTTP request

**Cons:**
- Only works when registry server running locally
- Remote users can't use this

### Option B: Remote MCP Server (Future - Hosted Service)

**Architecture:**
```
Browser (static site)
    ↓ HTTP
Remote Registry Server (cloud)
    ↓ HTTP/WebSocket
User's Local MCP Server (optional)
    ↓ stdio
Claude Code
```

**Flow:**
1. Browser calls: `POST https://shipyard.app/api/conversation/import`
2. Remote server stores conversation in queue
3. User's local MCP server (if running) polls queue
4. Local MCP creates session file
5. Local MCP notifies remote server: "done"
6. Browser shows: "Session created"

**Pros:**
- Works for users without local MCP
- Scalable

**Cons:**
- Complex architecture
- Requires hosted infrastructure
- Coordination between remote and local

### Option C: Browser Downloads, Manual Import (Current - Works Now)

**Flow:**
1. Browser downloads `conversation-xyz.a2a.json`
2. User manually tells Claude: "Import this conversation file"
3. Claude reads file, uses as context

**Pros:**
- Works immediately
- No server needed
- User in control

**Cons:**
- Manual step required
- Not seamless

---

## Recommendation: Hybrid Approach

**Phase 1 (Now):** Option C - Download file, manual import
- Works for everyone immediately
- Simple, no new infrastructure

**Phase 2 (Local Development):** Option A - HTTP endpoint on registry server
- For developers running local MCP, seamless auto-import
- Browser detects if `localhost:32191` is reachable
- If yes: POST to import endpoint
- If no: Fall back to download

**Phase 3 (Remote/Hosted):** Option B - Remote registry with local sync
- For users not running MCP locally
- Remote server queues conversation
- Local MCP (if running) pulls and creates session

---

## For Your Specific Questions

### Q1: "Which endpoint makes most sense to use?"

**Answer:** Add **`POST /api/conversation/import`** to the registry server.

**Why:**
- Registry server already runs on known port (32191/32192)
- Browser already calls registry for session discovery
- Can write to filesystem (unlike static browser)
- Available when user has local MCP running

### Q2: "Should we point to local MCP server instead?"

**Answer:** You CAN'T point to MCP server directly from browser.

**Why:**
- MCP protocol uses stdio transport (stdin/stdout)
- Browsers can't access stdio - only HTTP/WebSocket
- Registry server IS the HTTP interface to your MCP ecosystem

### Q3: "For developers running MCP locally, registry or MCP?"

**Answer:** Use **registry server's HTTP API**.

**Reason:**
- Browser needs HTTP
- MCP server = stdio only
- Registry server = HTTP bridge to MCP functionality

### Q4: "When we host remote MCP server?"

**Answer:** Remote registry would:
- Accept HTTP from any browser
- Store conversation in database/queue
- Local MCP (if user has it) polls queue
- If no local MCP: Just download file

**This is Phase 3 - not needed for initial launch.**

---

## Immediate Next Step

Add this endpoint to registry server:

```typescript
POST /api/conversation/import
```

This lets browser create Claude Code session files when registry server is running locally.

Want me to have an agent implement this endpoint?
