# Context Teleportation: Implementation Synthesis

**Issue:** #41 - Teleport conversation history between agents
**Date:** 2026-01-12
**Status:** Design Synthesis

---

## Executive Summary

After comprehensive research, the recommended approach is **NOT base64-encoded export/import** as originally proposed. Instead, leverage shipyard's existing P2P infrastructure to store conversation context as **another synced CRDT data type**. This aligns with the A2A (Agent2Agent) protocol's philosophy and requires minimal new infrastructure.

---

## Key Insight: We Already Have the Infrastructure

**Current shipyard architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                  Yjs P2P Sync Network                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  MCP Server  │◄──►│   Browser    │◄──►│ Remote Peer  │      │
│  │  (Claude)    │    │  (Human)     │    │   (Devin)    │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         ▲                    ▲                    ▲             │
│         └────────────────────┴────────────────────┘             │
│              Y.Doc syncs automatically via:                     │
│              • y-websocket (MCP ↔ browser)                      │
│              • y-webrtc (P2P between browsers/agents)           │
│              • y-indexeddb (local persistence)                  │
└─────────────────────────────────────────────────────────────────┘
```

**What syncs today:**
- Plan content (BlockNote XmlFragment)
- Comments/threads (Y.Map)
- Artifacts (Y.Array)
- Review status (Y.Map metadata)
- Agent presence (Y.Map)

**What we need to add:**
- **Conversation context** (Y.Array) ← Just another synced type!

---

## Recommended Approach: Y.Array Activity Feed

### Add to Y.Doc Schema

Following our existing patterns (artifacts, deliverables, presence), add:

```typescript
// packages/schema/src/yjs-keys.ts
export const YDOC_KEYS = {
  // ... existing keys

  /**
   * Activity feed / conversation history (Y.Array<ActivityUpdate>)
   * Contains agent actions, system events, and human interactions
   * Auto-syncs across all peers via P2P network
   *
   * Used by:
   * - Server: apps/server/src/tools/log-activity.ts (write)
   * - Web: apps/web/src/components/ActivityFeed.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  ACTIVITY: 'activity' as const,
} as const;
```

### Schema Definition

**Option A: A2A-Inspired Multi-Part Format (Recommended)**

Adopt A2A's multi-part pattern for richer activity updates:

```typescript
// packages/schema/src/plan.ts

/**
 * Activity part types - inspired by A2A Message.parts[]
 */
export const ActivityPartSchema = z.discriminatedUnion('type', [
  // Text content
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),

  // Structured data (metadata, tool results, etc.)
  z.object({
    type: z.literal('data'),
    data: z.any(),
  }),

  // File/artifact reference
  z.object({
    type: z.literal('file'),
    uri: z.string(),      // URL to artifact
    mediaType: z.string().optional(),
    name: z.string().optional(),
  }),
]);

export type ActivityPart = z.infer<typeof ActivityPartSchema>;

/**
 * Activity update - A2A Message compatible
 */
export const ActivityUpdateSchema = z.object({
  // A2A Message fields
  messageId: z.string(),               // A2A: messageId
  role: z.enum(['user', 'agent']),     // A2A: role
  parts: z.array(ActivityPartSchema),  // A2A: parts[]

  // Context linking (A2A standard)
  contextId: z.string().optional(),         // A2A: contextId
  taskId: z.string().optional(),            // A2A: taskId
  referenceTaskIds: z.array(z.string()).optional(),  // A2A: referenceTaskIds

  // Shipyard specific
  createdAt: z.number(),               // Timestamp
  activityType: z.enum([
    'agent_action',
    'system_event',
    'human_feedback',
    'milestone',
    'blocker',
    'decision',
    'context_import',
  ]).optional(),

  // Extensibility (A2A pattern)
  metadata: z.record(z.unknown()).optional(),  // A2A: metadata
  extensions: z.array(z.string()).optional(),  // A2A: extensions

  // Blocker resolution
  resolved: z.boolean().optional(),
  resolvedBy: z.string().optional(),
});

export type ActivityUpdate = z.infer<typeof ActivityUpdateSchema>;
```

**Option B: Simpler Format (If A2A compatibility not needed)**

```typescript
export const ActivityUpdateSchema = z.object({
  id: z.string(),
  type: z.enum(['agent_action', 'system_event', 'human_feedback', 'milestone', 'blocker', 'decision']),
  userId: z.string(),
  content: z.string(),
  createdAt: z.number(),

  // Optional fields
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  metadata: z.any().optional(),
});
```

**Recommendation:** Use Option A (multi-part) for future A2A compatibility, even if we don't use all features immediately.

### Helper Functions

```typescript
// packages/schema/src/yjs-helpers.ts

export function getActivityFeed(ydoc: Y.Doc): ActivityUpdate[] {
  const array = ydoc.getArray(YDOC_KEYS.ACTIVITY);
  const data = array.toJSON() as unknown[];

  return data
    .map(item => ActivityUpdateSchema.safeParse(item))
    .filter(result => result.success)
    .map(result => result.data);
}

export function addActivityUpdate(
  ydoc: Y.Doc,
  update: Omit<ActivityUpdate, 'id' | 'createdAt'>
): ActivityUpdate {
  const array = ydoc.getArray(YDOC_KEYS.ACTIVITY);

  const fullUpdate: ActivityUpdate = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...update,
  };

  // Convert to Y.Map (following BlockNote thread pattern)
  const yMap = new Y.Map();
  Object.entries(fullUpdate).forEach(([key, value]) => {
    if (value !== undefined) yMap.set(key, value);
  });

  array.push([yMap]);

  return fullUpdate;
}

export function observeActivity(
  ydoc: Y.Doc,
  callback: (updates: ActivityUpdate[]) => void
): () => void {
  const array = ydoc.getArray(YDOC_KEYS.ACTIVITY);
  const handler = () => callback(getActivityFeed(ydoc));
  array.observe(handler);
  return () => array.unobserve(handler);
}
```

---

## How This Solves Issue #41

### Scenario 1: Agent Handoff (Claude → Devin)

**WITHOUT this feature (today):**
```
1. Claude creates plan, makes progress
2. User wants to hand off to Devin
3. Devin has no context about what Claude did
4. Must re-read plan and comments from scratch
```

**WITH this feature (activity feed in Y.Doc):**
```
1. Claude creates plan
2. Claude logs: addActivityUpdate(ydoc, {
     type: 'agent_action',
     userId: 'claude-session-xyz',
     content: 'Created authentication middleware scaffold'
   })
3. Activity syncs to Y.Doc → browser → other peers
4. User opens plan in Devin's MCP client
5. Devin connects to same Y.Doc (via plan URL)
6. Devin calls read_plan → sees activity feed
7. Devin knows: "Claude created auth middleware, tests pending"
```

**The magic:** No export/import needed. It's just CRDT sync.

### Scenario 2: Human-in-Loop Review

**User provides feedback in browser:**
```typescript
// Browser UI
function postReviewFeedback(content: string) {
  addActivityUpdate(ydoc, {
    type: 'human_feedback',
    userId: githubUsername,
    content: 'Please use OAuth instead of email/password'
  });
}
```

**Agent sees feedback immediately:**
```typescript
// MCP tool: read_plan
const activity = getActivityFeed(ydoc);
const recentFeedback = activity.filter(a =>
  a.type === 'human_feedback' &&
  a.createdAt > lastCheckTimestamp
);
// Returns in read_plan result
```

### Scenario 3: Multi-Agent Pairing

**Three agents on same plan:**
```
Claude:  "Working on auth middleware"  →  Y.Doc.activity
Devin:   "Running tests"               →  Y.Doc.activity
Browser: Sees both in real-time        ←  Y.Doc.activity
```

All agents and humans see the same synchronized activity feed.

---

## A2A Protocol Alignment

### A2A Message Format (Core Structure)

The A2A protocol defines a rich message schema that we can adapt:

```typescript
// A2A Message (from specification)
interface Message {
  messageId: string;           // UUID
  role: "user" | "agent";      // Direction of communication
  parts: Part[];               // Multi-part content container
  contextId?: string;          // Groups related exchanges
  taskId?: string;             // Links to specific task
  referenceTaskIds?: string[]; // References to related tasks
  metadata?: Record<string, unknown>;  // Custom extensibility
  extensions?: string[];       // Extension URIs
}

// Part types (one per Part)
type Part = TextPart | FilePart | DataPart;

interface TextPart {
  text: string;
}

interface FilePart {
  // Exactly one of:
  fileWithUri?: { uri: string };
  fileWithBytes?: { bytes: string };  // base64
  // Both:
  mediaType: string;  // MIME type
  name?: string;      // filename
}

interface DataPart {
  data: object;  // Arbitrary JSON
}
```

**Key advantages for shipyard:**
1. **Multi-part messages**: Single activity update can contain text + metadata + file references
2. **Extensibility**: `metadata` and `extensions` provide future-proof schema evolution
3. **Task linking**: `referenceTaskIds[]` connects activity to multiple deliverables
4. **Standard roles**: "user" vs "agent" aligns with our use case

### What We Can Leverage from A2A

| A2A Concept | Shipyard Mapping | Benefit |
|-------------|-------------------|---------|
| **Message.parts[]** | Multi-part activity updates (text + data + file) | Richer activity entries |
| **contextId** | Plan ID (groups all activity for this plan) | Standard context grouping |
| **taskId** | Deliverable ID (links to specific work) | Traceability |
| **referenceTaskIds[]** | Link activity to multiple deliverables | Cross-references |
| **historyLength** | Pagination parameter for activity feed | Performance optimization |
| **metadata** field | Extensible custom data per update | Future-proof |
| **extensions[]** | Declare which extensions contributed | Capability tracking |
| **Artifacts** | Already implemented (GitHub blobs) | Proof of work |
| **input-required state** | Blockers in activity feed | Human-in-loop |
| **Agent Cards** | `/.well-known/agent-card.json` | Discovery |

### Additional A2A Features to Consider

**1. History Retrieval with `historyLength`**

A2A supports controlled history retrieval:
- `historyLength: undefined` - Default amount
- `historyLength: 0` - No history (minimal context)
- `historyLength: 100` - Last 100 messages

**Application to shipyard:**
```typescript
// MCP tool: read_plan with history control
read_plan({
  planId: 'abc123',
  includeActivity: true,
  activityLimit: 50  // Last 50 updates only
})
```

**Benefit:** Performance optimization for long-running plans with 1000+ activity updates.

**2. Extensions Array for Capability Tracking**

Track which shipyard features contributed to an activity:

```typescript
addActivityUpdate(ydoc, {
  messageId: 'uuid-123',
  role: 'agent',
  parts: [{ type: 'text', text: 'Uploaded screenshot' }],
  extensions: [
    'https://shipyard.app/extensions/artifacts/v1',
    'https://shipyard.app/extensions/screenshots/v1'
  ]
});
```

**Benefit:** Future-proof for when we add new capabilities.

**3. Task State Machine**

A2A task states map to shipyard flow:

| A2A State | Shipyard Equivalent |
|-----------|---------------------|
| `submitted` | Plan created (draft) |
| `working` | Agent actively working (in_progress) |
| `input-required` | Blocker posted, awaiting human |
| `completed` | Deliverable done |
| `failed` | Task failed with error |

**Application:** Use `activityType` to signal state transitions.

**4. Push Notifications (Future)**

A2A webhook pattern for external notifications:

```typescript
// When plan approved, notify external system
POST https://ci-system.com/webhook
{
  "type": "task_updated",
  "taskId": "plan-abc123",
  "status": "approved",
  "contextId": "plan-abc123"
}
```

**Use cases:**
- Trigger CI/CD pipeline on approval
- Notify Slack when agent requests review
- Alert monitoring when blocker posted

### Optional: Agent Card for Shipyard

```json
// https://shipyard.app/.well-known/agent-card.json
{
  "protocolVersion": "1.0",
  "name": "shipyard",
  "description": "P2P collaborative planning and review system",
  "supportedInterfaces": [
    {
      "protocol": "a2a/json-rpc",
      "uri": "wss://signaling.shipyard.app"
    },
    {
      "protocol": "mcp",
      "uri": "stdio://shipyard-mcp"
    }
  ],
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "name": "collaborative_planning",
      "description": "Create and review implementation plans with multiple agents and humans",
      "tags": ["planning", "review", "collaboration"],
      "examples": ["Create plan for adding authentication", "Review plan with team"],
      "inputModes": ["text"],
      "outputModes": ["text", "application/json"]
    },
    {
      "name": "artifact_verification",
      "description": "Upload and review proof-of-work artifacts (screenshots, test results)",
      "tags": ["artifacts", "verification"],
      "inputModes": ["application/octet-stream"],
      "outputModes": ["text/uri-list"]
    }
  ]
}
```

This makes shipyard discoverable to A2A-compatible orchestrators.

---

## When URL Export IS Needed

While P2P sync handles the primary use case, URL export is still valuable for:

### 1. Bootstrapping New Agents Without P2P Access

**Scenario:** Remote agent (API-only Devin instance) can't join WebRTC mesh.

**Solution:** Export as URL snapshot:
```typescript
// MCP tool: export_conversation_context
export function exportContext(ydoc: Y.Doc): string {
  const snapshot = {
    plan: getPlanMetadata(ydoc),
    content: yXmlFragmentToBlocks(ydoc.getXmlFragment(YDOC_KEYS.DOCUMENT_FRAGMENT)),
    threads: parseThreads(ydoc.getMap(YDOC_KEYS.THREADS)),
    activity: getActivityFeed(ydoc),
    artifacts: getArtifacts(ydoc),
  };

  return lzstring.compressToEncodedURIComponent(JSON.stringify(snapshot));
}
```

**Usage:**
```
Claude: export_conversation_context(planId)
→ Returns URL with full context
→ Share URL with Devin
→ Devin creates new plan from snapshot
```

### 2. Archival and Backup

Export for long-term storage or compliance:
```bash
# Store exported context in GitHub artifacts
curl -X POST .../add_artifact \
  -d '{"type": "context_export", "filename": "session-2026-01-12.json"}'
```

### 3. Cross-Platform Handoff (Different Repos)

If agents work on different codebases, P2P sync won't work. Use URL transfer:
```
Repo A (Claude) → Export context → Repo B (Devin) → Import
```

---

## Implementation Phases

### Phase 1: Activity Feed in Y.Doc (Core)

**Effort:** 1-2 days

1. Add `ACTIVITY` key to YDOC_KEYS
2. Add ActivityUpdateSchema to schema package
3. Add helper functions (get, add, observe)
4. Create MCP tool: `log_activity`
5. Update `read_plan` to include recent activity
6. Create ActivityFeed UI component

**Result:** Agents can log activity, humans see it in browser, all syncs via P2P.

### Phase 2: A2A-Compatible Export (Optional)

**Effort:** 2-3 days

1. Implement `export_conversation_context` MCP tool
2. Format output to align with A2A Message schema
3. Include contextId, taskId mappings
4. Compress with lz-string
5. Return base64 blob + URL

**Result:** Agents can export for external sharing.

### Phase 3: A2A-Compatible Import (Optional)

**Effort:** 2-3 days

1. Implement `import_conversation_context` MCP tool
2. Parse A2A-compatible or shipyard format
3. Create new plan with imported activity
4. Map external IDs to local IDs
5. Preserve provenance (who created original context)

**Result:** Agents can import from other agents/platforms.

### Phase 4: Agent Card (Future)

**Effort:** 1 day

1. Create static `/.well-known/agent-card.json`
2. Declare shipyard capabilities
3. Deploy on GitHub Pages

**Result:** A2A-compatible orchestrators can discover shipyard.

---

## Comparison: Yjs Sync vs. URL Export

| Aspect | Yjs Sync (Recommended) | URL Export/Import |
|--------|------------------------|-------------------|
| **Complexity** | Low (use existing infra) | Medium (new tools) |
| **Latency** | Real-time (<1s) | Manual step |
| **Persistence** | Automatic (IndexedDB) | Requires user action |
| **Multi-peer** | Built-in | One-way transfer |
| **Size limit** | ~10MB practical | ~100KB URL safe |
| **Offline** | Works (cached in IndexedDB) | Requires online for initial load |
| **Use case** | Primary (agents on same plan) | Fallback (cross-repo, archival) |

**Recommendation:** Implement Yjs sync (Phase 1) first. Add export/import (Phases 2-3) only if needed.

---

## Technical Architecture

### Data Flow

```
Agent Action → MCP Tool → Y.Doc.activity → P2P Sync → All Peers
     ↓             ↓            ↓               ↓           ↓
  Claude       log_activity  CRDT sync    WebSocket    Browser
                                           WebRTC       Devin
                                           IndexedDB    Remote
```

### Message Structure (Yjs)

```typescript
// In Y.Doc
Y.Array<Y.Map<ActivityUpdate>> at YDOC_KEYS.ACTIVITY

// Each activity update:
{
  id: "uuid-123",
  type: "agent_action",
  userId: "claude-session-xyz",
  content: "Created auth middleware scaffold",
  createdAt: 1704070800000,
  contextId: "plan-abc", // A2A compatibility
  taskId: "deliverable-1", // Links to specific work item
  metadata: {
    toolName: "write",
    files: ["/src/auth/middleware.ts"]
  }
}
```

### A2A Message Format (Export)

For external sharing, translate to A2A:

```json
{
  "messageId": "uuid-123",
  "role": "agent",
  "parts": [
    {
      "text": "Created auth middleware scaffold"
    },
    {
      "data": {
        "type": "metadata",
        "toolName": "write",
        "files": ["/src/auth/middleware.ts"]
      }
    }
  ],
  "contextId": "plan-abc",
  "taskId": "deliverable-1"
}
```

---

## A2A Features We Can Leverage

### 1. contextId for Grouping

**Use case:** Group all activity for a plan under single context ID.

```typescript
// Every activity for this plan shares contextId
const contextId = planId; // plan-abc123

addActivityUpdate(ydoc, {
  type: 'agent_action',
  contextId,  // A2A standard field
  userId: 'claude-session-xyz',
  content: 'Implemented middleware'
});
```

**Benefit:** When exporting to A2A-compatible systems, context is pre-grouped.

### 2. Artifact Streaming

**Use case:** Large artifacts (video, test results) streamed incrementally.

Current shipyard implementation:
- Artifacts stored in GitHub (already works)
- Could add streaming upload if artifacts get very large (>100MB)

A2A pattern:
```typescript
// TaskArtifactUpdateEvent
{
  artifact: {
    parts: [
      { data: chunk1, append: true },
      { data: chunk2, append: true },
      { data: chunk3, append: true, lastChunk: true }
    ]
  }
}
```

**Recommendation:** Not needed now. GitHub API handles up to 100MB fine.

### 3. Push Notifications (Webhooks)

**Use case:** Notify external systems when plan status changes.

A2A pattern:
```json
POST https://external-system.com/webhook
{
  "type": "task_updated",
  "taskId": "plan-abc123",
  "status": "approved",
  "timestamp": "2026-01-12T..."
}
```

**Application to shipyard:**
- Notify CI/CD when plan approved
- Alert Slack channel when agent requests review
- Trigger downstream agents when deliverable complete

**Recommendation:** Add in future milestone (M11+).

### 4. Agent Cards for Discovery

**Use case:** Multi-agent orchestrator discovers shipyard capabilities.

**Example orchestrator logic:**
```typescript
// Orchestrator reads agent cards
const shipyardCard = await fetch('https://shipyard.app/.well-known/agent-card.json');
const claudeCard = await fetch('https://claude.ai/.well-known/agent-card.json');

// Routes planning task to shipyard
if (task.type === 'collaborative_planning') {
  await sendMessage(shipyardCard.uri, task);
}
```

**Recommendation:** Implement when we want shipyard to participate in broader agent ecosystems.

---

## Comparison to Original Proposal

### Original (Issue #41)

```typescript
// export_conversation_context returns base64 blob
const blob = export_conversation_context(planId);
// → "H4sIAAAAAAAAA+xYbW/bNhD..."

// import_conversation_context creates new plan
import_conversation_context(blob);
```

**Problems:**
- Manual step (copy-paste blob)
- One-way transfer
- Size limits (~100KB)
- Doesn't leverage P2P network

### Recommended (Yjs Activity Feed)

```typescript
// Agent logs activity (auto-syncs to all peers)
log_activity({
  planId: 'abc123',
  type: 'agent_action',
  content: 'Implemented auth middleware'
});

// Other agent reads activity (already synced)
const activity = read_plan({ planId: 'abc123', includeActivity: true });
// → Sees Claude's work immediately
```

**Advantages:**
- Zero-copy handoff (just CRDT sync)
- Bi-directional (all peers see all activity)
- No size limits (Yjs handles MB-scale easily)
- Works offline (IndexedDB persistence)
- Real-time updates (<1s latency)

---

## Edge Cases & Considerations

### 1. Agent Without P2P Access

**Problem:** Devin API-only instance can't join WebRTC mesh.

**Solution:** Hybrid approach
- Primary: Activity feed in Y.Doc (syncs to browsers)
- Fallback: URL export when P2P unavailable
- Detection: If agent can't connect to WebSocket/WebRTC within 5s, offer URL

### 2. Cross-Repo Handoff

**Problem:** Claude working on `repo-A`, Devin on `repo-B`.

**Solution:** Export context as URL
- Claude exports activity + plan
- Devin imports to create new plan in repo-B
- Activity preserved with `imported_from` metadata

### 3. Large Activity History (10,000+ updates)

**Problem:** Y.Doc grows very large over months.

**Solution:** Retention policy
- Keep recent 1,000 updates in Y.Doc
- Archive older updates to GitHub artifacts
- UI: "Load more" button fetches from archive

**Reality:** Unlikely to hit this for years. 10K updates ≈ 2MB compressed.

### 4. Activity vs. Comments

**Question:** Why not just use BlockNote comments for everything?

**Answer:** Different use cases
- **Comments:** Human-to-human threaded discussions on specific blocks
- **Activity:** Agent actions, system events, chronological log
- **Comments are part of activity** when exported to A2A format

---

## Multi-Part Activity Examples

### Example 1: Agent Action with Tool Metadata

```typescript
// Claude logs creating a file
addActivityUpdate(ydoc, {
  messageId: crypto.randomUUID(),
  role: 'agent',
  parts: [
    { type: 'text', text: 'Created authentication middleware' },
    {
      type: 'data',
      data: {
        tool: 'Write',
        files: ['/src/auth/middleware.ts'],
        linesAdded: 127
      }
    }
  ],
  activityType: 'agent_action',
  taskId: 'deliverable-auth-middleware'
});
```

### Example 2: Human Feedback with Artifact Reference

```typescript
// Human posts review comment with screenshot
addActivityUpdate(ydoc, {
  messageId: crypto.randomUUID(),
  role: 'user',
  parts: [
    { type: 'text', text: 'The login button should be blue, not red' },
    {
      type: 'file',
      uri: 'https://raw.githubusercontent.com/.../screenshot.png',
      mediaType: 'image/png',
      name: 'login-page-feedback.png'
    }
  ],
  activityType: 'human_feedback'
});
```

### Example 3: Milestone with Cross-References

```typescript
// Agent marks multiple deliverables complete
addActivityUpdate(ydoc, {
  messageId: crypto.randomUUID(),
  role: 'agent',
  parts: [
    { type: 'text', text: 'Authentication system complete - middleware, tests, and docs ready' }
  ],
  activityType: 'milestone',
  referenceTaskIds: [
    'deliverable-middleware',
    'deliverable-tests',
    'deliverable-docs'
  ]
});
```

### Example 4: Blocker with Diagnostic Data

```typescript
// Agent encounters error and requests help
addActivityUpdate(ydoc, {
  messageId: crypto.randomUUID(),
  role: 'agent',
  parts: [
    { type: 'text', text: 'OAuth library throwing CORS errors in development' },
    {
      type: 'data',
      data: {
        error: 'Access-Control-Allow-Origin missing',
        library: '@auth/core@0.34.0',
        stackTrace: '...'
      }
    }
  ],
  activityType: 'blocker',
  taskId: 'deliverable-oauth'
});
```

**Benefit of multi-part:** Structured metadata enables better filtering, search, and tooling without parsing text.

---

## Concrete Example: Pairing Session (Multi-Part Format)

```typescript
// 15:00 - Claude creates plan
addActivityUpdate(ydoc, {
  messageId: 'msg-1',
  role: 'agent',
  parts: [{ type: 'text', text: 'Created authentication implementation plan' }],
  activityType: 'agent_action',
  contextId: 'plan-abc123'
});

// 15:05 - Claude scaffolds middleware
addActivityUpdate(ydoc, {
  messageId: 'msg-2',
  role: 'agent',
  parts: [
    { type: 'text', text: 'Created auth middleware scaffold' },
    { type: 'data', data: { tool: 'Write', files: ['/src/auth/middleware.ts'] } },
    { type: 'file', uri: 'https://.../screenshot-middleware.png', mediaType: 'image/png' }
  ],
  activityType: 'agent_action',
  taskId: 'deliverable-middleware'
});

// 15:10 - Claude hits blocker
addActivityUpdate(ydoc, {
  messageId: 'msg-3',
  role: 'agent',
  parts: [
    { type: 'text', text: 'OAuth library configuration unclear - CORS errors in dev' },
    {
      type: 'data',
      data: {
        error: 'Access-Control-Allow-Origin missing',
        library: '@auth/core@0.34.0',
        triedSolutions: ['Added cors middleware', 'Checked .env config']
      }
    }
  ],
  activityType: 'blocker',
  taskId: 'deliverable-oauth'
});

// ⚡ SYNC: Activity syncs to browser via WebSocket/WebRTC

// 15:12 - Human sees blocker in browser, responds
addActivityUpdate(ydoc, {
  messageId: 'msg-4',
  role: 'user',
  parts: [
    { type: 'text', text: 'Use @auth/core with the `trustHost` option in dev mode' },
    {
      type: 'file',
      uri: 'https://authjs.dev/reference/core#trusthost',
      name: 'auth-core-docs'
    }
  ],
  activityType: 'human_feedback',
  referenceTaskIds: ['msg-3']  // References blocker
});

// ⚡ SYNC: Feedback syncs back to MCP server

// 15:15 - Claude sees feedback, resolves blocker
const activity = getActivityFeed(ydoc);
const recentFeedback = activity.find(a => a.messageId === 'msg-4');
// Claude processes feedback...

addActivityUpdate(ydoc, {
  messageId: 'msg-5',
  role: 'agent',
  parts: [
    { type: 'text', text: 'Applied trustHost option, CORS resolved' },
    { type: 'data', data: { config: { trustHost: true } } }
  ],
  activityType: 'decision',
  referenceTaskIds: ['msg-3']  // Resolves blocker
});

// Mark blocker resolved
const blockerMsg = ydoc.getArray(YDOC_KEYS.ACTIVITY).get(2) as Y.Map;
blockerMsg.set('resolved', true);
blockerMsg.set('resolvedBy', 'msg-4');

// 15:20 - User switches to Devin
// Devin connects to same Y.Doc via plan URL
// read_plan returns full activity feed
const context = read_plan({ planId: 'abc123', includeActivity: true });
/*
Returns:
[
  { agent: 'claude', action: 'Created plan' },
  { agent: 'claude', action: 'Created middleware', files: [...], screenshot: '...' },
  { agent: 'claude', blocker: 'OAuth CORS', tried: [...] },
  { human: 'alice', feedback: 'Use trustHost', link: '...' },
  { agent: 'claude', decision: 'Applied trustHost', resolved: 'msg-3' }
]
*/

// 15:30 - Devin continues with full context
addActivityUpdate(ydoc, {
  messageId: 'msg-6',
  role: 'agent',
  parts: [
    { type: 'text', text: 'Implemented OAuth flow with Google provider' },
    { type: 'file', uri: 'https://.../test-results.json', mediaType: 'application/json' }
  ],
  activityType: 'agent_action',
  taskId: 'deliverable-oauth',
  metadata: { agentType: 'devin', sessionId: 'devin-xyz' }
});

// 15:35 - Devin requests review
addActivityUpdate(ydoc, {
  messageId: 'msg-7',
  role: 'agent',
  parts: [
    { type: 'text', text: 'Auth system complete: middleware + OAuth + tests' }
  ],
  activityType: 'milestone',
  referenceTaskIds: ['deliverable-middleware', 'deliverable-oauth', 'deliverable-tests']
});
```

**Result:** Complete context continuity with zero manual export/import. All activity syncs via P2P network.

---

## What We Learned from A2A (Summary)

### 1. Multi-Part Messages are Powerful

A2A's `parts[]` array solves the problem of "should I put metadata in a string or separate field?" by allowing:
- Text content (human-readable)
- Data objects (machine-readable)
- File references (artifacts)

All in a single message!

### 2. Task Linking Creates Context Web

`referenceTaskIds[]` enables building a graph of related work:
```
Blocker msg-3 → Human feedback msg-4 → Resolution msg-5
                                    ↓
                              Deliverable complete msg-6
```

This is more powerful than linear activity logs.

### 3. History Retrieval Patterns

`historyLength` parameter teaches us:
- Agents don't always need full history
- Pagination is a first-class concern
- Performance > completeness for many use cases

### 4. Extensions are Better than Versions

Instead of schema versioning (`v1`, `v2`), A2A uses:
```typescript
extensions: ['https://shipyard.app/extensions/screenshots/v1']
```

This allows **additive evolution** - old clients ignore unknown extensions.

### 5. Metadata > Custom Fields

Rather than adding `screenshotUrl`, `testResults`, `errorDetails` as top-level fields, use:
```typescript
metadata: {
  screenshot: 'url',
  testResults: {...},
  errorDetails: {...}
}
```

Keeps schema stable while allowing infinite extension.

---

## Migration Path for Existing Plans

Plans created before this feature won't have activity feed:

```typescript
// In useHydration or similar
function ensureActivityFeedExists(ydoc: Y.Doc) {
  const array = ydoc.getArray(YDOC_KEYS.ACTIVITY);

  if (array.length === 0) {
    // Backfill with creation event
    const metadata = getPlanMetadata(ydoc);
    addActivityUpdate(ydoc, {
      type: 'system_event',
      userId: metadata.ownerId,
      content: `Plan created: ${metadata.title}`,
    });
  }
}
```

---

## Performance Projections

**Assumptions:**
- Active session: 100-500 activity updates
- Long-running plan: 5,000 updates over months

**Yjs sizing:**
```
100 updates    ≈ 20 KB
500 updates    ≈ 100 KB
5,000 updates  ≈ 1 MB (compressed: 400-600 KB)
```

**Sync overhead:**
- Initial: Full Y.Doc (one-time cost)
- Incremental: ~10-100 bytes per update
- WebRTC P2P: No server load

**Bottleneck:** Not activity feed. BlockNote document content is larger.

**Optimization:** If activity exceeds 10K updates, implement pagination/archival. Unlikely for years.

---

## Recommendation Summary

### Phase 1 (Recommended): Activity Feed in Y.Doc

**Implement:**
1. Add `ACTIVITY` key to YDOC_KEYS
2. Add ActivityUpdateSchema to schema package
3. Add helper functions (get, add, observe)
4. Create `log_activity` MCP tool
5. Update `read_plan` to include activity
6. Create ActivityFeed React component

**Don't implement (yet):**
- URL export/import (defer to Phase 2)
- A2A message translation (defer to Phase 3)
- Agent Cards (defer to Phase 4)

**Result:**
- Agents log activity as they work
- Activity syncs automatically via P2P
- All peers (agents + humans) see same timeline
- Works offline via IndexedDB
- Minimal new code (follows existing patterns)

### Phase 2 (Optional): URL Export

Only if needed for:
- Cross-repo handoffs
- Agents without P2P access
- Archival/compliance

### Phase 3 (Future): A2A Compatibility

When A2A protocol matures and shipyard needs to integrate with A2A orchestrators.

---

## Related Issues

- #39: Activity feed - **This is the implementation!**
- #38: Agent naming - Activity uses `userId` (GitHub username or session ID)
- #17: Claude Code integration - Activity feed enables transparent agent actions

---

*Last updated: 2026-01-12*
