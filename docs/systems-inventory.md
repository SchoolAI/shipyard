# Peer-Plan: Systems Inventory & Assumptions

This document tracks all systems to build and open assumptions requiring resolution.

---

## Research Findings Summary (2026-01-02)

### loro-extended / CRDT Layer

| Claim in Design Doc | Reality | Impact |
|---------------------|---------|--------|
| `github.com/anthropics/loro-extended` | **Does not exist.** Actual repo: `github.com/schoolAI/loro-extended` | Must correct attribution |
| Built-in WebRTC adapters | Only in `@loro-extended`, not core `loro-crdt` | Need to use SchoolAI's extended layer |
| No Node.js polyfills needed | Core CRDT works, but WebRTC in Node.js still needs polyfills | MCP server WebRTC is harder |
| Schemas + reactivity out of box | Only via `@loro-extended`, not base library | Must use extended layer |

**SPIKE RESULTS (2026-01-02):**
- WebSocket sync between Node.js server and client works
- No WebRTC needed for MCP ↔ browser sync (WebSocket is sufficient!)
- Bidirectional CRDT sync confirmed
- `@loro-extended/adapter-websocket` has `/server` and `/client` exports

**Recommendation:** Use `loro-crdt` + `@loro-extended` from SchoolAI with WebSocket adapter for MCP-to-browser sync. Browser-to-browser can use WebRTC separately.

### MCP SDK

| Finding | Details |
|---------|---------|
| Package | `@modelcontextprotocol/sdk` |
| Transport | stdio (local) or HTTP/SSE (remote) |
| Tool pattern | `server.setRequestHandler(CallToolRequestSchema, ...)` or `server.tool()` |
| Validation | Uses Zod for schemas |

**Status:** Well-documented, ready to use.

### GitHub API Limits

| Limit | Value | Impact |
|-------|-------|--------|
| Max file size via API | 100 MB (effectively ~75 MB due to base64) | May need Releases API for large videos |
| Rate limit (content creation) | 80/minute, 500/hour | Batch artifact uploads carefully |
| Orphan branch creation | **Not possible via API** | Must use local git commands |
| Private repo raw access | Requires PAT authentication | Static site needs auth for private repos |
| Git LFS + GitHub Pages | **Incompatible** (serves pointer files) | Don't use LFS for artifacts |

### WebRTC/Signaling

| Component | Recommendation |
|-----------|----------------|
| STUN servers | Google's free: `stun.l.google.com:19302` (and stun1-4) |
| Signaling | `wss://signaling.yjs.dev` (free, public) |
| Self-hosted backup | y-webrtc built-in server (~50 lines of code) |
| TURN | Not needed initially (only for corporate firewalls) |

**Status:** Zero-infrastructure is achievable.

---

## Systems to Build

### 1. MCP Server (Node.js)
**Purpose:** Local server that agents connect to for plan creation and artifact management

- [ ] MCP tool definitions (`create_plan`, `add_artifact`, `get_feedback`, etc.)
- [ ] loro-extended integration (join mesh as peer)
- [ ] GitHub API integration (push to orphan branch)
- [ ] WebRTC peer connection management
- [ ] Plan/artifact local storage before push
- [ ] Browser auto-launch with plan URL

**Assumptions to resolve:**
- [x] Which MCP SDK to use? → `@modelcontextprotocol/sdk` (official TypeScript SDK)
- [x] loro-extended Node.js compatibility → Core `loro-crdt` works via WASM; WebRTC needs polyfills
- [ ] How does agent "wake up" when feedback arrives? (polling vs observers vs explicit action)

---

### 2. Static Web UI (GitHub Pages)
**Purpose:** Browser-based plan viewer and annotation interface

- [ ] Plan renderer (steps, status, metadata)
- [ ] Artifact viewer (images, videos, JSON, diffs)
- [ ] Annotation system (add/reply/resolve comments)
- [ ] loro-extended client integration
- [ ] WebRTC mesh joining logic
- [ ] Fallback to static JSON fetch when no peers online
- [ ] Review submission UI (approve/request changes)

**Assumptions to resolve:**
- [ ] UI framework? (React, Svelte, vanilla JS, etc.)
- [ ] Styling approach? (Tailwind, CSS modules, etc.)
- [ ] How to handle large artifacts? (lazy loading, size limits)
- [ ] Authentication/identity for annotations? (GitHub OAuth, anonymous, peer IDs?)

---

### 3. loro-extended Integration
**Purpose:** CRDT sync layer for conflict-free collaboration

- [ ] Schema definition for plan document
- [ ] WebRTC adapter configuration
- [ ] Signaling server connection
- [ ] Persistence strategy (when to commit to GitHub)
- [ ] Conflict resolution for concurrent edits

**Assumptions to resolve:**
- [x] Does loro-extended actually exist? → Yes, but at `github.com/schoolAI/loro-extended` (not Anthropic)
- [x] Which signaling server to use? → `wss://signaling.yjs.dev` (free, public)
- [ ] How does loro-extended handle offline → online transitions?
- [x] Binary artifact handling → CRDT syncs metadata only; binaries stored in Git orphan branch

---

### 4. GitHub Orphan Branch Storage
**Purpose:** Persistent artifact storage using git

- [ ] Branch creation/initialization logic
- [ ] Directory structure management (`/pr-{N}/plan-{id}/`)
- [ ] Artifact upload via GitHub API
- [ ] URL generation for raw file access
- [ ] Optional cleanup GitHub Action

**Assumptions to resolve:**
- [x] GitHub API rate limits → 80/min, 500/hr for content ops. Batch carefully.
- [x] Max file size limits via API? → 100MB (75MB effective due to base64). Use Releases API for larger.
- [x] Should we use Git LFS? → **No.** Incompatible with GitHub Pages (serves pointer files).
- [x] How to handle private repos? → Require PAT auth for raw.githubusercontent.com access.

---

### 5. Signaling Infrastructure
**Purpose:** WebRTC peer discovery

- [ ] STUN server selection/configuration
- [ ] Optional TURN server for NAT traversal
- [ ] Room-based peer discovery

**Assumptions to resolve:**
- [x] Use public STUN? → Yes, Google's free STUN servers (`stun.l.google.com:19302`)
- [x] Do we need TURN? → Not initially. Only for restrictive corporate firewalls.
- [x] Signaling server → Use `wss://signaling.yjs.dev` with fallbacks to EU/US Heroku servers

---

### 6. Plan Data Model & Schema
**Purpose:** Structured format for plans and annotations

- [ ] Plan JSON schema definition
- [ ] Artifact metadata schema
- [ ] Annotation schema
- [ ] Review/approval schema
- [ ] Versioning strategy

**Assumptions to resolve:**
- [ ] Use JSON Schema, TypeScript types, or Zod?
- [ ] How to handle schema migrations?
- [ ] Annotation threading — flat or nested replies?

---

## Cross-Cutting Concerns

### Security
- [ ] Artifact integrity verification (hashes)
- [ ] Peer authentication in mesh
- [ ] GitHub PAT scope requirements

**Assumptions:**
- [ ] Do we need end-to-end encryption for P2P?
- [ ] How to prevent annotation spoofing?

### Developer Experience
- [ ] Installation/setup documentation
- [ ] CLI for common operations?
- [ ] Error messages and debugging

### Testing Strategy
- [ ] Unit tests for MCP tools
- [ ] Integration tests for GitHub API
- [ ] E2E tests for P2P sync

---

## Dependency Research Needed

| Dependency | Question | Status | Finding |
|------------|----------|--------|---------|
| loro-extended | Does it exist? API stability? Node.js support? | RESOLVED | Exists at SchoolAI, core works in Node.js, WebRTC needs polyfills |
| MCP SDK | Latest version, tool definition patterns | RESOLVED | `@modelcontextprotocol/sdk`, well-documented |
| GitHub API | Rate limits, file size limits, orphan branch creation | RESOLVED | 100MB limit, orphan branches via git only |
| WebRTC/STUN | Public server reliability, TURN necessity | RESOLVED | Google STUN + yjs.dev signaling, no TURN needed |
| UI Framework | Best fit for real-time collaborative UI | OPEN | React likely, but not critical path |

---

## Risk Registry

| Risk | Impact | Likelihood | Mitigation | Status |
|------|--------|------------|------------|--------|
| loro-extended doesn't work as documented | HIGH | MEDIUM | Fallback to Yjs + y-webrtc | VALIDATED: API differs from design doc claims |
| GitHub rate limits hit | MEDIUM | LOW | Batch uploads, caching | MITIGATED: 80/min is workable |
| NAT/firewall blocks WebRTC | MEDIUM | LOW | TURN server fallback, async JSON mode | ACCEPTED |
| Large artifacts slow sync | MEDIUM | MEDIUM | Only sync metadata, not binary | RESOLVED: Design already separates binary storage |
| **NEW: WebRTC in Node.js needs polyfills** | LOW | N/A | **RESOLVED:** Use WebSocket for MCP↔browser, WebRTC only for browser↔browser | MITIGATED via WebSocket |
| **NEW: Private repos need auth for raw URLs** | MEDIUM | MEDIUM | Require PAT config, or use public repos only | DESIGN DECISION NEEDED |
| **NEW: Orphan branch can't be created via API** | LOW | CERTAIN | Document git-based setup, or auto-create via MCP shell | ACCEPTED |
| **NEW: @loro-extended npm availability unclear** | LOW | N/A | **RESOLVED:** All packages published to npm (v4.0.0 as of 2026-01-02) | MITIGATED |

---

## Build Order (Suggested)

### Phase 0: Technical Spikes (De-risk)
1. **CRDT library spike** — Test loro-crdt + @loro-extended OR Yjs + y-webrtc
2. **Node.js WebRTC spike** — Verify MCP server can join mesh (or decide browser-only sync)

### Phase 1: Foundation
3. **Data model & schema** — TypeScript types, Zod schemas for plan/artifact/annotation
4. **MCP Server (basic)** — `create_plan`, `add_artifact` tools, stdio transport
5. **GitHub orphan branch** — Shell-based init, API-based file push

### Phase 2: Core Experience
6. **Static UI (basic)** — Plan viewer, artifact display, fetch from raw GitHub
7. **CRDT integration (browser)** — Live sync between browser peers
8. **Annotation system** — Add/reply/resolve comments

### Phase 3: Full P2P
9. **MCP server mesh participation** — If spike successful; otherwise browser-only live sync
10. **Agent feedback loop** — How agent learns of new annotations

### Phase 4: Polish
11. **Error handling & edge cases** — Offline, reconnection, conflicts
12. **Documentation & setup guide** — Installation, PAT config, orphan branch init

---

## Architectural Decisions Needed

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| CRDT library | loro-crdt + @loro-extended vs Yjs + BlockNote | **Yjs + BlockNote** (ADR-0001) | DECIDED |
| Block editor | Custom vs BlockNote vs BlockSuite | **BlockNote** (built-in comments, Yjs-native) | DECIDED |
| MCP server sync | WebRTC vs WebSocket | **y-websocket** (no polyfills needed) | DECIDED |
| Private repo support | Require PAT auth vs Public repos only | Start with public, add PAT later | OPEN |
| UI framework | React | BlockNote is React-native | DECIDED |
| Logging | pino vs winston vs consola | **pino** (stderr-safe, aligns with standards) | DECIDED |

---

## Next Steps

1. ~~Run CRDT/WebRTC spike to de-risk Node.js mesh participation~~ **DONE**
2. ~~If loro-extended is problematic, fall back to Yjs~~ **NOT NEEDED - loro-extended works great**
3. **Define TypeScript schemas** for Plan, Artifact, Annotation
4. **Build MCP Server (basic)** with `create_plan`, `add_artifact` tools
5. **Build GitHub orphan branch** artifact storage
6. **Build static UI** with React + loro-extended hooks
7. Add browser-to-browser WebRTC sync for remote reviewers

---

*Last updated: 2026-01-02*
