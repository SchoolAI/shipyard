# Peer-Plan Architecture

This document captures the refined architecture based on research and spikes conducted on 2026-01-02.

---

## Data Model

Peer-Plan uses a layered data model where different types of data live in different places:

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
│  ├── Include: plan structure + annotations + status             │
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

The actual source of truth is the distributed CRDT state stored in browser IndexedDB and synced across peers.

---

## Network Architecture

```
┌────────────────────────────────────┐    ┌────────────────────────┐
│     Your Machine                   │    │     Remote Peer        │
│                                    │    │                        │
│  ┌──────────────────────────────┐  │    │  ┌──────────────────┐  │
│  │ AI Agent (Claude)            │  │    │  │ Browser          │  │
│  └──────────┬───────────────────┘  │    │  │ (loro WebRTC)    │  │
│             │ MCP                  │    │  └──────────┬───────┘  │
│             ▼                      │    └─────────────┼──────────┘
│  ┌──────────────────────────────┐  │                  │
│  │ MCP Server (Node.js)         │  │                  │
│  │ • @loro-extended/repo        │  │                  │ WebRTC P2P
│  │ • adapter-websocket/server   │  │                  │
│  └──────────┬───────────────────┘  │                  │
│             │ WebSocket            │                  │
│             │ (localhost)          │                  │
│             ▼                      │                  │
│  ┌──────────────────────────────┐  │                  │
│  │ Author's Browser             │◄─┼──────────────────┘
│  │ • @loro-extended/react       │  │
│  │ • adapter-websocket/client   │  │
│  │ • adapter-webrtc (for peers) │  │
│  │ • IndexedDB (persistence)    │  │
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
https://{host}/plan?d={compressed-data}

Where compressed-data = lz-string.compressToEncodedURIComponent(JSON.stringify({
  v: 1,                    // Version for forward compatibility
  id: "plan-abc123",       // Plan ID (hash of initial content)
  repo: "org/repo",        // GitHub repo for artifacts
  pr: 42,                  // PR number
  title: "...",            // Plan title
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
| GitHub artifacts deleted | Binary blobs | Plan + annotations intact, just missing visuals |
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

### Validated (via spike)

| Component | Choice | Package |
|-----------|--------|---------|
| CRDT | loro-crdt | `loro-crdt@1.10.3` |
| Sync framework | loro-extended | `@loro-extended/repo@4.0.0` |
| MCP ↔ Browser | WebSocket | `@loro-extended/adapter-websocket` |
| Browser ↔ Browser | WebRTC | `@loro-extended/adapter-webrtc` |
| Browser storage | IndexedDB | `@loro-extended/adapter-indexeddb` |
| React hooks | loro-extended | `@loro-extended/react` |

### Planned

| Component | Choice | Rationale |
|-----------|--------|-----------|
| URL compression | lz-string | Purpose-built for URL encoding, small, fast |
| MCP SDK | @modelcontextprotocol/sdk | Official SDK |
| UI framework | React | loro-extended has React hooks |
| Artifact storage | GitHub orphan branch | Same repo, same permissions |

---

## Open Decisions (Two-Way Doors)

These decisions can be revised as we build:

| Decision | Current Thinking | Revisable? |
|----------|------------------|------------|
| Plan ID format | Hash of initial content | Yes |
| Title mutability | Probably immutable | Yes |
| Steps mutability | Probably mutable (via CRDT) | Yes |
| URL max size handling | Start with inline, add hash fallback if needed | Yes |
| Artifact URL pattern | `raw.githubusercontent.com/{repo}/plan-artifacts/pr-{pr}/{plan-id}/{file}` | Yes |

---

## References

- [loro-extended GitHub](https://github.com/SchoolAI/loro-extended)
- [lz-string GitHub](https://github.com/pieroxy/lz-string)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Spike code: `spikes/loro-websocket/`

---

*Last updated: 2026-01-02*
