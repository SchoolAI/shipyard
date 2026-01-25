# Shipyard Architecture

This document captures the current architecture based on research and spikes conducted on 2026-01-02.

**Key Technology Decisions:** See [decisions/](./decisions/) for the evolution of architectural choices.

**Current stack:** Yjs + BlockNote ([ADR-0001](./decisions/0001-use-yjs-not-loro.md))

---

## Data Model

Shipyard uses a layered data model where different types of data live in different places:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA HIERARCHY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SOURCE OF TRUTH: Distributed CRDT State                        │
│  ├── Browser IndexedDB (persistent, survives refresh)           │
│  ├── Other peers' browsers (distributed backup)                 │
│  └── MCP server (while session active)                          │
│                                                                 │
│  SNAPSHOTS: URLs                                                │
│  ├── Can be generated anytime from current state                │
│  ├── Shareable "save points"                                    │
│  ├── Include: task structure + annotations + status             │
│  └── Multiple snapshots can exist (version history)             │
│                                                                 │
│  BLOBS: GitHub                                                  │
│  └── Binary artifacts only (screenshots, videos, test results)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Insight: URLs Are Snapshots, Not Source of Truth

URLs are **materialized views** of the current state that can be regenerated at any time. They serve as:
- Shareable links to bootstrap new peers
- Save points / bookmarks
- Recovery mechanism if local state is lost

The actual source of truth is the distributed CRDT state stored in browser IndexedDB and synced across peers. Task data lives in the CRDT, not in GitHub.

---

## Network Architecture

```
┌────────────────────────────────────┐    ┌────────────────────────┐
│     Your Machine                   │    │     Remote Peer        │
│                                    │    │                        │
│  ┌──────────────────────────────┐  │    │  ┌──────────────────┐  │
│  │ AI Agent (Claude)            │  │    │  │ Browser          │  │
│  └──────────┬───────────────────┘  │    │  │ (y-webrtc)       │  │
│             │ MCP                  │    │  └──────────┬───────┘  │
│             ▼                      │    └─────────────┼──────────┘
│  ┌──────────────────────────────┐  │                  │
│  │ MCP Server (Node.js)         │  │                  │
│  │ • yjs                        │  │                  │ WebRTC P2P
│  │ • y-websocket (server)       │  │                  │
│  └──────────┬───────────────────┘  │                  │
│             │ WebSocket            │                  │
│             │ (localhost)          │                  │
│             ▼                      │                  │
│  ┌──────────────────────────────┐  │                  │
│  │ Author's Browser             │◄─┼──────────────────┘
│  │ • yjs                        │  │
│  │ • y-websocket (client)       │  │
│  │ • y-webrtc (for peers)       │  │
│  │ • y-indexeddb (persistence)  │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

### Sync Topology

1. **MCP ↔ Browser**: WebSocket (validated in spike)
2. **Browser ↔ Browser**: WebRTC via public signaling (`wss://signaling.yjs.dev`)
3. **Persistence**: IndexedDB in each browser

---

## URL Encoding

### Approach

Based on research of production systems (itty.bitty, Excalidraw, textarea.my):

- **Library**: `lz-string` with `compressToEncodedURIComponent()`
- **Compression**: 40-60% reduction typical
- **Safe capacity**: 2-4KB compressed (all browsers), up to 10KB (modern)

### URL Structure

```
https://{host}/?d={compressed-data}

Where compressed-data = lz-string.compressToEncodedURIComponent(JSON.stringify({
  v: 1,                    // Version for forward compatibility
  id: "task-abc123",       // Task ID (hash of initial content)
  repo: "org/repo",        // GitHub repo for artifacts
  pr: 42,                  // PR number
  title: "...",            // Task title
  steps: [...],            // Step definitions
  artifacts: [...],        // Artifact references (filenames only)
  annotations: [...],      // Current annotations (snapshot)
  status: "pending_review" // Current status (snapshot)
}))
```

### Versioning

The `v` field allows schema evolution:
- `v: 1` = current schema
- Future versions can add fields, change structure
- Decoder checks version and handles accordingly

---

## Resilience Model

### Failure Scenarios

| Scenario | Data Lost | Recovery |
|----------|-----------|----------|
| Browser storage cleared | Local CRDT state | Sync from peers, or load URL snapshot |
| All peers offline | Nothing | Load from local IndexedDB |
| GitHub artifacts deleted | Binary blobs | Task + annotations intact, just missing visuals |
| User loses URL | Nothing | Generate new URL from current state |
| **Catastrophic**: All storage + no peers + no URLs | Everything | Would need to recreate |

### Why Catastrophic Loss Is Unlikely

Requires ALL of these simultaneously:
1. User's browser storage cleared
2. All peers' browser storage cleared
3. No URL snapshots saved anywhere (bookmarks, messages, etc.)

The distributed nature of P2P means data naturally replicates across peers.

---

## Technology Choices

| Component | Choice | Package | Rationale |
|-----------|--------|---------|-----------|
| CRDT | Yjs | `yjs@13.6.0` | Mature, BlockNote-native |
| Block editor | BlockNote | `@blocknote/react@0.18.0` | Notion-like UI, built-in comments |
| MCP ↔ Browser | y-websocket | `y-websocket@2.0.4` | WebSocket provider for Yjs |
| Browser ↔ Browser | y-webrtc | `y-webrtc@10.3.0` | P2P sync for remote reviewers |
| Browser storage | IndexedDB | `y-indexeddb@9.0.12` | Persistence across sessions |
| Comments | BlockNote native | `YjsThreadStore` | Threaded comments, reactions |
| URL compression | lz-string | `lz-string@1.5.0` | Purpose-built for URL encoding, small, fast |
| MCP SDK | Official SDK | `@modelcontextprotocol/sdk` | Agent integration |
| UI framework | React | `react@18.3.0` | BlockNote is React-native |
| Artifact storage | GitHub orphan branch | GitHub API | Same repo, same permissions |
| Build tool | tsdown | `tsdown@0.3.1` | 49% faster than tsup |
| Linting | Biome | `biome@1.9.4` | 20-50x faster than ESLint |
| Testing | Vitest | `vitest@2.1.0` | Fast, parallel execution |

See [engineering-standards.md](./engineering-standards.md#shipyard-tech-stack) for full stack details and [decisions/0001-use-yjs-not-loro.md](./decisions/0001-use-yjs-not-loro.md) for decision rationale.

---

## Open Decisions (Two-Way Doors)

These decisions can be revised as we build:

| Decision | Current Thinking | Revisable? |
|----------|------------------|------------|
| Task ID format | Hash of initial content | Yes |
| Title mutability | Probably immutable | Yes |
| Steps mutability | Probably mutable (via CRDT) | Yes |
| URL max size handling | Start with inline, add hash fallback if needed | Yes |
| Artifact URL pattern | `raw.githubusercontent.com/{repo}/task-artifacts/pr-{pr}/{task-id}/{file}` | Yes |

---

## References

- [loro-extended GitHub](https://github.com/SchoolAI/loro-extended)
- [lz-string GitHub](https://github.com/pieroxy/lz-string)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Spike code: `spikes/loro-websocket/`

---

*Last updated: 2026-01-02*
