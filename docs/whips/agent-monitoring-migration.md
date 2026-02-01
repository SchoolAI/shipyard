# Agent Monitoring System Migration

**Created:** 2026-01-31
**Status:** Planning
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

## Open Questions

### From Architecture Doc

| # | Question | Status | Notes |
|---|----------|--------|-------|
| 1 | Agent type registry location | Open | Config file? Fetched from signaling? Hard-coded? |
| 2 | Task hydration at spawn | Open | Agent fetches (pull) vs daemon passes (push)? |
| 3 | Collab room permissions | Open | View-only vs interactive? Per-user capabilities? |
| 4 | Run history / archival | Open | R2? Filesystem? Keep in LevelDB? |
| 5 | Multi-machine naming | Open | How to disambiguate same agent type on multiple machines? |
| 6 | Schema evolution | Open | How to handle breaking changes with P2P sync? |
| 7 | MCP tool surface | Open | Which tools does daemon expose? How do they map to Loro events? |
| 8 | TURN provider | Open | Cloudflare Calls? Metered.ca? Self-hosted coturn? |
| 9 | Permission granularity | Open | What specific operations need separate permissions? |
| 10 | Delegation depth | Open | Can collaborators grant access to others, or only owners? |

### From Current Implementation Analysis

| # | Question | Status | Notes |
|---|----------|--------|-------|
| 11 | Hook migration | Open | How do hooks work with daemon-as-MCP-server? |
| 12 | Session token → JWT | Open | Migration path for existing tokens? |
| 13 | Plan-index doc | Open | Does Personal Room replace it? Or complement? |
| 14 | GitHub OAuth worker | Open | Merge into signaling worker? Keep separate? |
| 15 | Daemon lock management | Open | Still needed if daemon = MCP server? |

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

### Phase 1: Signaling Infrastructure (Week 1-2)

**Goal:** New room topology + Shipyard JWT auth

1. Create PersonalRoom Durable Object
   - User authentication (GitHub OAuth → Shipyard JWT)
   - Agent registry (machineId, agentType, status)
   - WebRTC signaling relay

2. Create CollabRoom Durable Object
   - Pre-signed URL validation
   - Participant management
   - Task bridging

3. Implement Shipyard JWT
   - Token generation (after OAuth)
   - Token validation (signature check)
   - Agent token scoping

4. Update OAuth worker
   - Merge into signaling worker (or keep separate)
   - Issue Shipyard JWT instead of passing GitHub token

**Deliverables:**
- [ ] PersonalRoom DO with auth
- [ ] CollabRoom DO with pre-signed URLs
- [ ] Shipyard JWT generation/validation
- [ ] Signaling worker deployed

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
