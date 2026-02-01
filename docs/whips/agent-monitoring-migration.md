# Agent Monitoring System Migration

**Created:** 2026-01-31
**Status:** Phase 1 Complete (Signaling Infrastructure)
**Updated:** 2026-02-01
**Scope:** Architecture migration from current Yjs/y-webrtc topology to loro-extended with Personal/Collab room model

---

## Executive Summary

This WHIP documents the migration to an Agent Monitoring System that enables:
1. **Personal Dashboard**: View all your agents across all machines from any device
2. **Collaboration Rooms**: Share specific agent sessions with teammates

The migration involves significant changes to room topology, authentication, sync infrastructure, and daemon architecture.

---

## Current State Inventory

### Apps Overview

| App | Purpose | Key Files | Lines |
|-----|---------|-----------|-------|
| **daemon** | Agent launcher (separate for lifecycle) | 12 files | ~1,200 |
| **server** | MCP server, hub/client mode | 54 files | ~14,000 |
| **web** | Browser app, multi-provider sync | 200+ files | ~15,000 |
| **signaling** | WebRTC signaling (Node + CF DO) | 20+ files | ~2,500 |
| **hook** | Claude Code hooks | 15 files | ~2,000 |
| **github-oauth-worker** | OAuth proxy | 3 files | ~300 |
| **og-proxy-worker** | OG meta injection | 3 files | ~500 |

### Current Topology

```
                    ┌─────────────────────────────────┐
                    │        Signaling Server         │
                    │   (Node.js dev / CF DO prod)    │
                    │   - y-webrtc protocol           │
                    │   - GitHub OAuth auth           │
                    │   - Invite tokens               │
                    └────────────────┬────────────────┘
                                     │ WebRTC signaling
    ┌────────────────────────────────┼────────────────────────────────┐
    │                                │                                │
    │  ┌─────────────────────────────┴─────────────────────────────┐  │
    │  │                      Browser                               │  │
    │  │  ┌─────────────────────────────────────────────────────┐  │  │
    │  │  │            useMultiProviderSync                      │  │  │
    │  │  │  ┌───────────┐  ┌────────────┐  ┌──────────────┐   │  │  │
    │  │  │  │ IndexedDB │  │ WebSocket  │  │   WebRTC     │   │  │  │
    │  │  │  │(y-indexeddb)│ │(y-websocket)│ │ (y-webrtc)   │   │  │  │
    │  │  │  └─────┬─────┘  └──────┬─────┘  └──────┬───────┘   │  │  │
    │  │  │        └───────────────┴───────────────┘            │  │  │
    │  │  │                     Y.Doc                           │  │  │
    │  │  └─────────────────────────────────────────────────────┘  │  │
    │  └───────────────────────────┬───────────────────────────────┘  │
    │                              │ y-websocket                      │
    └──────────────────────────────┼──────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │        MCP Server           │
                    │   (Hub or Client mode)      │
                    │   - LevelDB persistence     │
                    │   - execute_code sandbox    │
                    │   - tRPC API                │
                    └──────────────┬──────────────┘
                                   │ MCP (stdio)
                    ┌──────────────┴──────────────┐
                    │       Claude Code           │
                    └─────────────────────────────┘

    Separate process:
    ┌─────────────────────────────────────────────┐
    │              Daemon                          │
    │   - WebSocket :56609                        │
    │   - Agent spawning                          │
    │   - Singleton via lock file                 │
    │   - Auto-start (launchd/systemd)            │
    └─────────────────────────────────────────────┘
```

### Current Data Flow

1. **Plan Creation**: Hook intercepts ExitPlanMode → creates Y.Doc → opens browser
2. **Sync**: Y.Doc syncs via WebSocket to hub, WebRTC to peers, IndexedDB for persistence
3. **Agent Spawning**: Browser → WebSocket → Daemon → spawns Claude Code
4. **Auth**: GitHub OAuth → token verified per signaling request

### Current Y.Doc Keys

```typescript
YDOC_KEYS = {
  METADATA,           // Plan info (id, title, status, etc.)
  DOCUMENT_FRAGMENT,  // BlockNote XML (source of truth)
  THREADS,            // Comments
  ARTIFACTS,          // Proof-of-work files
  DELIVERABLES,       // Checklist items
  EVENTS,             // Activity timeline
  SNAPSHOTS,          // Version history
  INPUT_REQUESTS,     // User input modals
  LINKED_PRS,         // GitHub PR links
  PR_REVIEW_COMMENTS, // PR diff comments
  LOCAL_DIFF_COMMENTS,// Local diff comments
  CHANGE_SNAPSHOTS,   // Git changes per machine
  PRESENCE,           // Agent presence (audit)
  PLANS,              // Plan index (special doc)
}
```

---

## Target Architecture

### Design Philosophy

- **Online-first**: Assumes internet connectivity as default
- **Privacy by design**: Signaling sees only metadata; content travels P2P
- **Events as data**: Store operations for replay, not derived state
- **Pre-built agents only**: No arbitrary command execution from remote
- **Peer-to-peer compute**: No central backend doing work

### Target Topology

```
                                    ┌─────────────────────────┐
                                    │   Cloudflare Edge       │
                                    │                         │
                                    │  ┌───────────────────┐  │
                                    │  │  Worker           │  │
                                    │  │  ├── /auth/*      │  │
                                    │  │  └── WebSocket    │  │
┌──────────────┐                    │  └───────────────────┘  │
│              │  WebSocket         │  ┌───────────────────┐  │
│   Browser    │◄──────────────────►│  │  Durable Objects  │  │
│              │  (signaling)       │  │  ├── PersonalRoom │  │
│  IndexedDB   │                    │  │  └── CollabRoom   │  │
│  (Loro)      │                    │  └───────────────────┘  │
└──────┬───────┘                    └─────────────────────────┘
       │                                        ▲
       │ WebRTC P2P                             │
       │ (Loro sync)                            │ WebSocket
       │                                        │ (signaling)
       ▼                                        │
┌──────────────────────────────────────────────┴──────────────┐
│                      User's Machine                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Daemon (singleton)                      │ │
│  │                                                         │ │
│  │  - MCP Server (agents connect here)                    │ │
│  │  - WebRTC peer (browsers connect here)                 │ │
│  │  - LevelDB persistence                                 │ │
│  │  - Agent spawning & lifecycle                          │ │
│  └──────────────────────┬─────────────────────────────────┘ │
│                         │ MCP                                │
│                         ▼                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Agent (Claude Code, etc.)                  │ │
│  │                                                         │ │
│  │  - Connects to daemon via MCP                          │ │
│  │  - Tool calls logged as events                         │ │
│  │  - Receives task context from daemon                   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Room Topology

**Personal Room** (`user:{shipyard_user_id}`)
- One per user, always exists
- Tracks all agents across all machines
- Agents register here on startup
- Browsers connect here for dashboard

**Collaboration Room** (`collab:{uuid}`)
- Created ad-hoc when sharing a task
- Access via pre-signed URL
- Temporary (can expire, be revoked)
- Bridges multiple users to one task

### Authentication & Tokens

| Token | Scope | Lifetime | Use |
|-------|-------|----------|-----|
| Session token | Full user access | Hours/days | Browser sessions |
| Agent token | Single task + machine | Minutes/hours | Passed to agent at spawn |

**Flow:**
1. User logs in with GitHub OAuth
2. Signaling server verifies with provider
3. Signaling server issues **Shipyard JWT** (signed with SECRET_KEY)
4. All subsequent requests use Shipyard JWT
5. Validation = signature check (no external API call)

### Permissions Model (Hybrid)

**Layer 1: Coarse scope in JWT**
```json
{
  "userId": "jacob",
  "scope": "task:abc123",
  "exp": ...
}
```

**Layer 2: Fine-grained in Loro doc**
```
permissions: (Map)
├── roles: { owner: ["*"], collaborator: ["plan:read", ...], viewer: [...] }
└── grants: { "user-alice": "collaborator", "user-bob": "viewer" }
```

### Async Input Pattern (Pause/Resume)

```
Agent needs blocking input
    │
    ▼
Agent calls MCP tool: request_input(question, blocking=true)
    │
    ▼
Daemon writes to Loro: { type: "input_request", question, blocking: true }
Daemon returns to agent: "pending, safe to terminate"
    │
    ▼
Agent terminates (system prompt tells it this is expected)
    │
    ▼
Daemon continues watching task Loro doc
    │
    ▼
Human responds via browser → writes input_response event to Loro
    │
    ▼
Daemon sees response event, synced via Loro
    │
    ▼
Daemon resumes agent with prior context + response
```

---

## Migration Strategy

### Greenfield + Legacy Rename

**Approach:** Don't migrate existing apps - create new ones and rename old to `-legacy`.

**Why this works:**
- No backwards compatibility concerns (no users yet)
- No commits breaking things mid-migration
- Clean separation between old and new
- Can reference legacy code while building new
- Delete legacy apps when new ones are stable

**Rename Pattern:**
```
apps/signaling/           → apps/signaling-legacy/
apps/github-oauth-worker/ → apps/github-oauth-worker-legacy/
apps/server/              → apps/server-legacy/
apps/daemon/              → (merged into new apps/server/)
apps/web/                 → apps/web-legacy/ (maybe)
```

**New Apps to Create:**
```
apps/signaling/           # New: Personal + Collab rooms, Shipyard JWT
apps/server/              # New: Daemon + MCP server combined, loro-extended
apps/web/                 # New or heavy refactor (TBD)
```

**Packages:**
```
packages/schema/          → packages/schema-legacy/
packages/loro-schema/     # New: Loro shapes, validators, helpers
```

---

## Migration Delta

### What Changes

| Component | Current | Target | Impact |
|-----------|---------|--------|--------|
| **Room Model** | Single global DO, plan topics | Personal + Collab rooms | Signaling rewrite |
| **Auth** | GitHub token per request | Shipyard JWT | Signaling + all apps |
| **Daemon** | Separate process | Merged into MCP server | Architecture change |
| **Sync** | y-websocket + y-webrtc + y-indexeddb | loro-extended adapters | All sync code |
| **Data** | Y.Doc (BlockNote XML) | LoroDoc (custom schema) | Schema + tools |
| **Signaling** | y-webrtc protocol | Custom + loro WebRTC adapter | Protocol change |
| **Browser→Daemon** | WebSocket :56609 | WebRTC via Personal Room | New pattern |

### Files to Delete (from Loro migration)

```bash
# Server sync infrastructure (~1,800 lines)
apps/server/src/registry-server.ts           # 1,070 lines
apps/server/src/hub-client.ts                # 177 lines
apps/server/src/doc-store.ts                 # 192 lines
apps/server/src/webrtc-provider.ts           # 356 lines

# Web sync infrastructure (~1,100 lines)
apps/web/src/hooks/useMultiProviderSync.ts   # 792 lines
apps/web/src/hooks/useYjsSync.ts             # 44 lines
apps/web/src/hooks/useP2PPeers.ts            # 208 lines

# Schema Yjs helpers (~2,500 lines)
packages/schema/src/yjs-helpers.ts           # 2,133 lines
packages/schema/src/yjs-keys.ts              # 229 lines
packages/schema/src/y-webrtc-internals.ts    # 112 lines
```

### New Components Needed

| Component | Purpose | Estimated Lines |
|-----------|---------|-----------------|
| **PersonalRoom DO** | User's agent registry + presence | ~500 |
| **CollabRoom DO** | Shared task session | ~300 |
| **Shipyard JWT utils** | Token generation + validation | ~200 |
| **loro-server.ts** | Replaces registry-server | ~600 |
| **useLoroSync.ts** | Replaces useMultiProviderSync | ~400 |
| **loro-schema shapes** | Replaces yjs-helpers | ~1,500 |
| **IndexedDBStorageAdapter** | loro-extended adapter | ~150 |
| **LevelDBStorageAdapter** | loro-extended adapter | ~150 |

---

## Open Questions (Resolved)

### From Architecture Doc

| # | Question | Status | Decision |
|---|----------|--------|----------|
| 1 | Agent type registry location | **Deferred** | Not needed for v1. Feature work for later. |
| 2 | Task hydration at spawn | **Resolved** | Push model (current behavior). Daemon passes context. |
| 3 | Collab room permissions | **Deferred** | Full access if in room. No fine-grained permissions for v1. |
| 4 | Run history / archival | **Resolved** | Keep in LevelDB forever. Storage is cheap, even 1000s of tasks is fine. |
| 5 | Multi-machine naming | **Deferred** | Not solving for v1. |
| 6 | Schema evolution | **Resolved** | Epochs + clean cuts. Will figure out proper evolution later. |
| 7 | MCP tool surface | **Resolved** | Keep existing tools (execute_code sandbox with all APIs). |
| 8 | TURN provider | **Deferred** | Has GitHub issue. Will address separately. |
| 9 | Permission granularity | **Deferred** | No fine-grained permissions for v1. Full access or no access. |
| 10 | Delegation depth | **Resolved** | Owners only can grant access. |

### From Current Implementation Analysis

| # | Question | Status | Decision |
|---|----------|--------|----------|
| 11 | Hook migration | **Resolved** | Hooks share utils with MCP server. Try to start daemon if not running, or connect to existing. |
| 12 | Session token → JWT | **Resolved** | Complete break. No migration path needed (no users). |
| 13 | Plan-index doc | **Resolved** | Becomes **RoomSchema.taskIndex** - denormalized task metadata per room. Synced via WebRTC P2P at connection time, NOT through signaling (privacy-by-design). |
| 16 | Input request location | **Resolved** | Per-task only in TaskDocumentSchema. No global requests. |
| 14 | GitHub OAuth worker | **Resolved** | Merge into signaling worker (same trust boundary). |
| 15 | Daemon lock management | **Resolved** | Yes, singleton daemon still required. |

### Key Architecture Clarification: RoomSchema & TaskIndex

The signaling server **never sees private data**. The RoomSchema works as follows:

```
Personal Room (signaling)           RoomSchema (Loro doc)
├── Presence only                   ├── taskIndex: denormalized metadata
├── Agent registry (ids, status)    │   └── taskId, title, status, ownerId,
├── WebRTC signaling relay          │       hasPendingRequests, lastUpdated
├── NO task content                 └── Synced P2P at connection
                                        (not through signaling)

Flow:
1. Browser connects to Personal Room via signaling
2. Signaling facilitates WebRTC handshake to daemon
3. Once WebRTC established, RoomSchema syncs P2P (direct)
4. TaskDocuments sync P2P based on visibility permissions
5. Signaling never sees task content or metadata
```

**Note:** Input requests removed from RoomSchema - they live in TaskDocumentSchema only.

---

## Known Limitations & Risks

### Accepted Limitations

| Limitation | Rationale |
|------------|-----------|
| Daemon crash = task lost mid-execution | Same as today; recovery is restart |
| Can't create tasks without agent online | P2P architecture requirement |
| Remote agents without daemon (Lovable-style) | Not solving for v1 |

### Risks to Monitor

| Risk | Mitigation |
|------|------------|
| WebRTC reconnection after network blip | loro-extended should handle; verify |
| Token expiry mid-session | Long-lived tokens for now; add refresh later |
| Loro doc growth for long-running tasks | May need archival strategy |
| GitHub OAuth rate limits | Cache user info after verification |

---

## Implementation Sequence

### Phase 1: Signaling Infrastructure ✅ COMPLETE (2026-02-01)

**Goal:** New room topology + Shipyard JWT auth

**Completed:**
1. ✅ Created PersonalRoom Durable Object
   - User authentication (GitHub OAuth → Shipyard JWT)
   - Agent registry (machineId, agentType, status)
   - WebRTC signaling relay
   - Message handlers for agent lifecycle

2. ✅ Created CollabRoom Durable Object
   - Pre-signed URL validation
   - Participant management (owner/collaborator roles)
   - Task bridging
   - WebRTC relay with user identity

3. ✅ Implemented Shipyard JWT
   - Token generation (7-day session, 24-hour agent tokens)
   - Token validation (HMAC-SHA256 signature check)
   - Agent token scoping (task + machine)
   - Pre-signed URL generation/validation

4. ✅ Updated Authentication
   - GitHub OAuth flow maintained in separate worker
   - Signaling validates tokens (not merged yet)
   - All routes use Shipyard JWT

**Additional Achievements:**
- ✅ Fan-in based coverage system (60% for high fan-in modules)
- ✅ 107 integration tests (100% route coverage)
- ✅ Zero type errors, zero lint errors
- ✅ Zod schemas for all request/response bodies
- ✅ Typed client with full API surface
- ✅ Route constants centralized
- ✅ Server validated and running

**Deliverables:**
- [x] PersonalRoom DO with auth
- [x] CollabRoom DO with pre-signed URLs
- [x] Shipyard JWT generation/validation
- [x] Signaling worker ready for deployment

**See:** `/private/tmp/claude/.../scratchpad/signaling-completion-report.md` for full details

### Phase 2: Daemon Consolidation (Week 3-4)

**Goal:** Daemon becomes the MCP server

1. Merge daemon into apps/server
   - Keep agent spawning logic
   - Keep lock management (adapted)
   - Add WebRTC peer capability

2. Update daemon to connect to Personal Room
   - Register on startup
   - Maintain presence
   - Receive spawn requests from browser

3. Implement Loro sync in daemon
   - LevelDBStorageAdapter
   - WebRTCAdapter (takes signaling channel)
   - loro-extended Repo setup

4. Update agent spawning
   - Pass Shipyard agent token
   - Pass task context from Loro doc

**Deliverables:**
- [ ] Daemon merged into server
- [ ] Daemon connects to Personal Room
- [ ] Loro persistence working
- [ ] Agent spawning with new tokens

### Phase 3: Browser Migration (Week 5-6)

**Goal:** Browser uses new infrastructure

1. Update browser auth flow
   - OAuth → Shipyard JWT
   - Store JWT for subsequent requests

2. Implement useLoroSync hook
   - IndexedDBStorageAdapter
   - WebRTCAdapter
   - loro-extended Repo

3. Update browser to connect to Personal Room
   - Display agent registry (dashboard)
   - Handle spawn requests via Personal Room

4. Implement collab room joining
   - Pre-signed URL handling
   - CollabRoom WebRTC connection

**Deliverables:**
- [ ] Browser auth with Shipyard JWT
- [ ] useLoroSync hook working
- [ ] Personal Room dashboard
- [ ] Collab room joining

### Phase 4: Hook Migration (Week 7)

**Goal:** Hooks work with new architecture

1. Update hook communication
   - Talk to daemon (not separate registry server)
   - Use Shipyard JWT

2. Update plan mode flow
   - ExitPlanMode creates Loro doc
   - Approval flow via Loro doc permissions

3. Session token migration
   - Replace session tokens with Shipyard agent tokens
   - Update artifact upload auth

**Deliverables:**
- [ ] Hooks work with daemon
- [ ] Plan mode creates Loro docs
- [ ] Agent tokens replace session tokens

### Phase 5: Cleanup (Week 8)

**Goal:** Remove old code, update docs

1. Delete deprecated files
   - Old sync infrastructure
   - Old Yjs helpers
   - Old signaling protocol

2. Update documentation
   - New architecture.md
   - New ADR superseding 0001
   - Update development.md

3. Final testing
   - E2E tests for new flows
   - Load testing
   - Multi-device testing

**Deliverables:**
- [ ] Old code removed
- [ ] Docs updated
- [ ] Tests passing

---

## Success Metrics

### Must Have (P0)
- [ ] Personal Room shows all user's agents
- [ ] Browser can spawn agent via Personal Room
- [ ] Loro sync works browser ↔ daemon
- [ ] Collab rooms work for sharing
- [ ] Shipyard JWT auth working

### Should Have (P1)
- [ ] Agent pause/resume for blocking input
- [ ] Multi-machine agent registry
- [ ] Pre-signed URL expiration
- [ ] Permission model enforced

### Nice to Have (P2)
- [ ] Directory discovery in browser
- [ ] Run history/archival
- [ ] Agent type registry (beyond hard-coded)

---

## Appendix: Current File Reference

### apps/daemon/ (to merge into server)
- `index.ts` - Entry point, lock acquisition
- `agent-spawner.ts` - Claude Code spawning
- `websocket-server.ts` - WS server for browser
- `protocol.ts` - Message handling
- `lock-manager.ts` - Singleton pattern
- `auto-start.ts` - OS-level persistence
- `config.ts` - Environment config

### apps/server/ (to refactor)
- `registry-server.ts` - **DELETE** (1,070 lines)
- `hub-client.ts` - **DELETE** (177 lines)
- `doc-store.ts` - **DELETE** (192 lines)
- `webrtc-provider.ts` - **DELETE** (356 lines)
- `tools/*.ts` - **UPDATE** (Loro instead of Yjs)
- `hook-handlers.ts` - **UPDATE** (new auth)
- `session-registry.ts` - **UPDATE** (JWT)

### apps/web/ (to refactor)
- `hooks/useMultiProviderSync.ts` - **DELETE** (792 lines)
- `hooks/useYjsSync.ts` - **DELETE** (44 lines)
- `hooks/useP2PPeers.ts` - **DELETE** (208 lines)
- `hooks/useDaemon.ts` - **UPDATE** (via Personal Room)
- `components/PlanViewer.tsx` - **UPDATE** (Tiptap)

### apps/signaling/ (to rewrite)
- `core/` - **REWRITE** (new room model)
- `cloudflare/` - **REWRITE** (Personal + Collab DOs)
- `node/` - **DELETE** (dev only, use wrangler dev)

### packages/schema/ (to migrate)
- `yjs-helpers.ts` - **DELETE** (2,133 lines)
- `yjs-keys.ts` - **DELETE** (229 lines)
- `plan.ts` - **UPDATE** (types mostly unchanged)
- `url-encoding.ts` - **UPDATE** (Loro format)

---

*Last updated: 2026-01-31*
