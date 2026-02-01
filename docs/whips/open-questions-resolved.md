# Open Questions: Resolved from Current Implementation

This document answers the open questions from the architecture docs based on what the current codebase already implements.

---

## Questions from Architecture Docs

### ✅ RESOLVED: Task ID Format

**Question:** Hash of initial content?

**Answer from Code:**
```typescript
// packages/schema/src/plan.ts - Uses nanoid()
id: nanoid()  // 21-char alphanumeric (default)
```

**Decision:** nanoid() for uniqueness, not content hash
- Pros: Simple, guaranteed unique, no collision risk
- Cons: Not deterministic (can't recreate ID from content)

**Recommendation for Loro:** Keep nanoid() - simpler and works

---

### ✅ RESOLVED: Artifact URL Pattern

**Question:** What URL pattern for artifacts?

**Answer from Code:**
```typescript
// apps/server/src/github-artifacts.ts:261
const url = `https://raw.githubusercontent.com/${repo}/${ARTIFACTS_BRANCH}/${path}`;

// Where path = `{planId}/{filename}`
// Example: https://raw.githubusercontent.com/SchoolAI/shipyard/plan-artifacts/abc123/screenshot.png
```

**Decision:** `raw.githubusercontent.com/{repo}/plan-artifacts/{planId}/{filename}`
- Uses orphan branch `plan-artifacts`
- No PR number in path (simpler)
- Flat structure per plan

**Recommendation for Loro:** Keep this pattern - it works

---

### ✅ RESOLVED: MCP Tool Surface

**Question:** Which MCP tools does the daemon expose?

**Answer from Code:**
```typescript
// packages/shared/src/instructions/tool-names.ts
TOOL_NAMES = {
  ADD_ARTIFACT,            // Upload proof artifacts
  COMPLETE_TASK,           // Mark task done
  CREATE_TASK,             // Create new plan
  EXECUTE_CODE,            // Run TypeScript with Shipyard APIs
  LINK_PR,                 // Link GitHub PR
  POST_UPDATE,             // Log activity event
  READ_DIFF_COMMENTS,      // Read PR review comments
  READ_TASK,               // Read plan details
  REGENERATE_SESSION_TOKEN,// Rotate token
  REQUEST_USER_INPUT,      // Ask user via modal (deprecated - use execute_code)
  SETUP_REVIEW_NOTIFICATION, // Setup approval notification
  UPDATE_BLOCK_CONTENT,    // Update plan content
  UPDATE_TASK,             // Update metadata/status
}
```

**Total:** 13 MCP tools

**Recommendation for Loro:**
- Keep all tools (business logic unchanged)
- `UPDATE_BLOCK_CONTENT` needs rewrite (Tiptap format)
- `EXECUTE_CODE` is the main agent interface

---

### ✅ RESOLVED: Permission Granularity (2026-02-01)

**Question:** What specific operations need permissions?

**Answer:** JWT scope + loro-extended visibility + operations enforce access

**Implementation:**
- **JWT scope exists** in agent tokens: `{ scope: "task:abc123" }`
- **loro-extended permissions** control document sync:
  - `visibility(doc, peer)` - Controls which docs sync to which peers
  - `mutability(doc, peer)` - Controls who can modify docs
- **Operations/helpers validate** before allowing writes
- **Shared permission logic** between all peers (browser, daemon, agents)

**No fine-grained permissions in CRDT for v1:**
- Full access if you have access to the doc
- Document-level isolation via visibility is sufficient
- Operations ensure only valid transitions

**Action Required:**
- Design full permission model from scratch
- Include signaling server permissions too
- Don't assume current schema
- **This is a Week 1 design task**

---

### ✅ RESOLVED: Invite Delegation

**Question:** Can approved users invite more users, or only the owner?

**Answer:** OWNER ONLY (simplest, two-way door)

**What this means:**
- Alice creates plan → Alice is owner
- Alice can invite Bob (creates invite token)
- Bob CANNOT invite Carol (only Alice can)
- No cascading - only the original owner grants access

**Current code enforces this:**
```typescript
// apps/signaling/core/handlers/invites.ts
// Only plan owner can create invites
if (planOwnerId && planOwnerId !== userId) {
  return error('unauthorized', 'Only plan owner can create invites');
}
```

**Loro:** Keep owner-only (simplest security, easy to change later)

---

### ⚠️ PARTIAL: Title Mutability

**Question:** Immutable or mutable?

**Answer from Code:**
```typescript
// packages/schema/src/yjs-helpers.ts
export function setPlanMetadata(ydoc: Y.Doc, updates: Partial<PlanMetadata>) {
  // Can update title via setPlanMetadata
}
```

**Current:** Title IS mutable

**Recommendation for Loro:** Make immutable for URL stability
- Title in URL shouldn't change
- Add `displayTitle` if needed for renames

---

### ✅ RESOLVED: Plan Content Mutability

**Question:** Is plan content editable after creation?

**Answer:** YES - plans are collaborative documents

**Current:**
- Plan content edited in BlockNote (fully mutable)
- Agents can update via UPDATE_BLOCK_CONTENT tool
- Humans can edit in browser

**Loro:**
- Same - Tiptap content is editable
- Agents update via Loro operations
- Collaborative editing via loro-prosemirror

---

### ✅ RESOLVED: URL Max Size Handling

**Question:** Inline or hash fallback?

**Answer:** INLINE ONLY (that's the point - free, no server storage)

**Browser Limits:**
- Chrome: 2M characters ✅
- Firefox: 65K characters ✅
- Safari: 80K characters ✅
- Edge: **32K characters** ✅ (Chromium-based, 2K is legacy IE limit)
- Opera: 190K characters ✅

**Edge Research Finding:**
- Official Microsoft docs: 2,083 chars (legacy IE limit)
- Actual Chromium limit: 32,779 chars (SISTRIX testing)
- Edge is Chromium-based since 2019 → uses Chromium limits
- **32KB plans WILL work in Edge**

**Decision:**
- All data encoded in `?d=` parameter
- lz-string compression (~40-60% reduction)
- Typical plan: ~10-20KB compressed (well under all limits)
- No server storage (free hosting on GitHub Pages)
- Document Edge as "best effort" (not officially supported by MS docs)

---

## Questions from Current Implementation (Not in Docs)

### ❓ NEW: Agent Type Registry

**Current Code:** No agent whitelist exists
- Daemon spawns arbitrary `claude` binary
- No agent type restrictions
- No agent capability registry

**Architecture Doc Says:** "Pre-built agents only"

**Question:** Where does agent type registry live?
- File on machine: ~/.shipyard/agents.json?
- Fetched from signaling server?
- Hard-coded in daemon?

**Recommendation:** Start with hard-coded list in daemon, make configurable later

---

### ❓ NEW: Task Hydration at Spawn

**Current Code:** Agent gets task via MCP tool
```typescript
// Agent calls: READ_TASK(taskId, sessionToken)
// Returns: {title, content, deliverables, artifacts}
```

**Architecture Doc Questions:**
- Agent fetches from Loro after connect?
- Or daemon passes context via MCP?

**Current Answer:** Agent fetches (pull model)

**Question for Loro:** Keep pull model or switch to push?
- Pull: Agent calls read_task (current)
- Push: Daemon passes full context at spawn

**Recommendation:** Keep pull - more flexible, agent controls timing

---

### ❓ NEW: Collab Room Permissions

**Current Code:** No collab rooms exist
- Current: Direct P2P via y-webrtc (no rooms)
- Everyone who joins has full read/write

**Architecture Doc Proposes:**
- PersonalRoom (user-specific)
- CollabRoom (shared session)
- View-only vs interactive

**Question:** Permission model for collab rooms?

**Recommendation:** Start with read-only collaborators, add interactive later

---

### ❓ NEW: Run History / Archival

**Current Code:**
```typescript
// packages/schema/src/plan.ts
archivedAt?: number;
archivedBy?: string;

// Stored in CRDT (Y.Doc metadata)
// No separate archival storage
```

**Decision:** Plans stay in LevelDB forever (no archival)

**Question for Scale:** What if user has 1000s of plans?
- Current: All in LevelDB (could get large)
- Options: R2, filesystem, SQLite index

**Recommendation:** Start with LevelDB, add archival when needed (not now)

---

### ❓ NEW: Multi-Machine Naming

**Current Code:** No multi-machine support
- Each machine runs separate MCP server
- No machine registry
- No coordination

**Architecture Doc Questions:** What if same agent on multiple machines?

**Recommendation:**
- Machine ID = hostname + nanoid (e.g., "macbook-pro-abc123")
- Personal room tracks: machineId + agentType
- No cross-machine coordination (separate agents)

---

### ❓ NEW: Schema Evolution

**Current Code:**
```typescript
// packages/schema/src/plan.ts
// No versioning on schemas
// Breaking changes = full redeploy
```

**Question:** How to handle breaking changes with P2P sync?
- Old clients with old schema?
- New clients with new schema?
- CRDT conflict?

**Recommendation:**
- Add schema version to Loro doc metadata
- Clients must have matching version (reject old clients)
- Breaking changes = coordinated upgrade

---

### ❓ NEW: TURN Provider

**Current Code:**
```typescript
// apps/server/src/webrtc-provider.ts:64-70
// Optional TURN from env vars (not configured)
const turnServers = TURN_URL && TURN_USERNAME && TURN_CREDENTIAL ? [{
  urls: TURN_URL,
  username: TURN_USERNAME,
  credential: TURN_CREDENTIAL
}] : [];
```

**Decision:** Optional, not required

**Question:** Which service?
- Cloudflare Calls (free tier)
- Metered.ca
- Self-hosted coturn

**Recommendation:** Cloudflare Calls (aligns with DO usage)

---

## NEW Open Questions from Migration

### 🔴 CRITICAL: Loro Shape Design

**Question:** What's the Loro Shape for a Task document?

**From architecture doc:**
```typescript
Task (loro doc)
├── structure (Tree)      → Block ordering/nesting, MovableTree
├── blocks (Map)          → blockId → block content
├── comments (Map)        → commentId → Comment
└── meta (Struct)         → title, createdAt, etc.
```

**Need to define:**
- Exact Shape API calls
- Container types (Tree, Map, List, Text)
- Field schemas
- How Tiptap maps to this

**Action Required:** Design Loro Shape before Week 1

---

### 🔴 CRITICAL: Comment Anchoring with Loro

**Question:** How do comments anchor to text with Loro Cursor API?

**From architecture doc:**
```typescript
// When creating comment, save cursor
const cursor = loroDoc.getText("content").getCursor(selectionStart)

// Later, after edits, get current position
const currentPos = loroDoc.getCursorPos(cursor)
```

**Need to validate:**
- Does loro-prosemirror expose cursors?
- Can we get selection position from Tiptap?
- Does Loro cursor survive all edit operations?

**Action Required:** Spike in Week 1

---

### 🟡 MEDIUM: Event Schema as Loro Structure

**Question:** How to store events in Loro?

**Current:** Y.Array<PlanEvent> with discriminated union types

**Options:**
1. LoroList with JSON strings (simple but less type-safe)
2. LoroList with nested LoroMaps (complex but structured)
3. Separate Loro container per event type (overkill)

**Recommendation:** LoroList with LoroMaps (option 2)
```typescript
events: LoroList<LoroMap> where each map = {
  id: string,
  type: string,
  actor: string,
  timestamp: number,
  data: LoroMap  // Event-specific data
}
```

---

### 🟡 MEDIUM: Snapshot Storage Format

**Question:** How to store snapshots with Tiptap content?

**Current:** Stores BlockNote Block[] as JSON

**Options:**
1. Tiptap JSON (editor.getJSON())
2. ProseMirror JSON (editor.state.doc.toJSON())
3. Markdown (lossy)

**Recommendation:** Tiptap JSON (option 1)
- Lossless
- Reconstruct exact editor state
- Forward-compatible

---

### 🟡 MEDIUM: Presence/Awareness API

**Question:** Does loro-extended presence match our needs?

**Current Yjs Awareness:**
```typescript
awareness.setLocalStateField('planStatus', {
  user,
  platform,
  status,
  isOwner,
  webrtcPeerId,
  context
});
```

**Need from loro-extended:**
- Custom fields per peer
- Change events
- Cleanup on disconnect

**Action Required:** Check loro-extended docs in Week 1

---

### 🟢 LOW: WebRTC Signaling Protocol

**Question:** Does current signaling work with loro-extended?

**Current:** y-webrtc signaling protocol (publish/subscribe)

**loro-extended:** BYODC (Bring Your Own Data Channel)
- You manage WebRTC connection
- loro-extended just uses the data channel

**Impact:** Need to adapt signaling slightly, but protocol stays similar

**Recommendation:** Keep current signaling, add loro-extended data channel integration

---

## Summary

### Answered by Current Code (7 questions)
- ✅ Task ID: nanoid()
- ✅ Artifact URL: raw.githubusercontent.com/{repo}/plan-artifacts/{planId}/{filename}
- ✅ MCP tools: 13 tools defined
- ✅ Delegation: Owner only (simplest)
- ✅ Plan content: Mutable (editable)
- ✅ URL encoding: Inline only (free, no server)
- ✅ TURN: Optional, Cloudflare Calls recommended

### Open for Design (2 questions)
- ❌ Permissions: Full redesign (don't assume current schema)
- ❌ Title mutability: TBD (make immutable for URL stability?)

### New Critical Questions (2 questions)
- 🔴 Loro Shape design - FULL schema including permissions (Week 1 blocker)
- 🔴 Tiptap + Loro spike - Comments, blocks, cursor API (Week 1 validation)

### New Medium Questions (3 questions)
- 🟡 Event storage format in Loro
- 🟡 Snapshot format with Tiptap
- 🟡 Signaling protocol adaptation

### Deferred Questions (3 questions)
- Agent type registry (start simple, iterate)
- Multi-machine coordination (not needed for v1)
- Archival strategy (LevelDB sufficient for now)

---

### ✅ RESOLVED: Document Isolation (2026-02-01)

**Question:** How to prevent unauthorized access to task data in P2P meshes?

**Answer:** loro-extended `visibility` permission at document level

**Implementation:**
- One WebRTC connection per room (Personal or Collab)
- Multiple docs sync over that connection
- `visibility(doc, peer)` controls which docs sync to which peers
- No sub-document encryption needed
- Same task doc can sync over multiple meshes (Personal Room + Collab Room)

**Security model:**
- Joining mesh ≠ access to all docs
- Docs only announced to authorized peers
- Once synced, can't retroactively revoke (P2P limitation)
- Compromise of healthy peer = that peer's data leaked (unavoidable)

---

### ✅ RESOLVED: Input Request Location (2026-02-01)

**Question:** Where do input requests live - global room or per-task?

**Answer:** Per-task ONLY in TaskDocumentSchema

**Rationale:**
- Input requests are part of task collaboration
- All peers with task access should see and can answer requests
- No `taskId` field needed (implicit from parent doc)
- Assumption: Tasks are created in UI first (no "general" requests)
- Simplifies schema, removes duplication

**Removed:**
- GlobalRoomSchema.inputRequests (deleted)
- taskId field from TaskDocumentSchema.inputRequests

---

### ✅ RESOLVED: ownerId Nullability (2026-02-01)

**Question:** Can ownerId be null?

**Answer:** No - ownerId is non-nullable everywhere

**Changes:**
- TaskDocumentSchema.meta.ownerId: `Shape.plain.string()` (removed `.nullable()`)
- RoomSchema.taskIndex.ownerId: `Shape.plain.string()` (non-nullable)

**Rationale:**
- Every task has an owner (created by user or agent on user's behalf)
- Set at creation time
- Simplifies permission checks
- Clearer ownership model

---

## Action Items for Week 1

Before starting implementation, resolve critical questions:

1. **Design Loro Shape (FULL SCHEMA)**
   - Map out exact container structure (Tree, Map, List, Text)
   - Define permissions model (roles, grants, operations)
   - Design event storage format (LoroList structure)
   - Define metadata fields
   - Validate with loro-extended Shape API
   - **This is the foundation - get this right**

2. **Spike: Tiptap + Loro Integration**
   - Build minimal editor: Tiptap + loro-prosemirror
   - Test basic editing (type, format, blocks)
   - Test comment marks (selection anchoring)
   - Test Loro cursor API (comment positioning)
   - Validate sync works (multi-tab editing)
   - **Prove the editor stack works before committing**

3. ✅ **Edge URL Limit Research** - RESOLVED
   - Chromium-based Edge supports 32K+ URLs
   - 2K limit is legacy IE (not relevant)
   - 32KB plans will work in Edge

**These 3 items are blockers for proceeding.** Don't start implementation until validated.
