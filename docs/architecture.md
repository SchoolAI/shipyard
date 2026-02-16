# Shipyard Architecture

This document captures the current architecture of Shipyard.

**Key Technology Decisions:** See [decisions/](./decisions/) for the evolution of architectural choices.

**Current stack:** Loro CRDT (loro-extended) + TipTap + HeroUI v3

---

## High-Level Architecture

Shipyard uses a **hub-and-spoke model** for real-time collaboration between humans and AI agents.

```
                          ┌──────────────────────────┐
                          │   Session Server          │
                          │   (CF Workers + Durable   │
                          │    Objects)                │
                          │   • Auth (Shipyard JWT)    │
                          │   • WebRTC signaling       │
                          │   • Peer discovery         │
                          └─────────┬──────────────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 │                  │                   │
        ┌────────▼───────┐  ┌──────▼───────┐  ┌───────▼───────┐
        │  Developer A    │  │  Browser B    │  │  Phone C      │
        │  Machine        │  │  (reviewer)   │  │  (mobile)     │
        │                 │  │               │  │               │
        │  ┌───────────┐  │  │  IndexedDB    │  │  IndexedDB    │
        │  │ Daemon/MCP │  │  │  persistence  │  │  persistence  │
        │  │ Server     │  │  │               │  │               │
        │  │ (Node.js)  │  │  └───────────────┘  └───────────────┘
        │  │ • LevelDB  │  │
        │  │ • Agent    │  │         All peers sync via
        │  │   spawning │  │         Loro CRDT over WebRTC
        │  └─────┬──────┘  │
        │        │ MCP     │
        │   ┌────▼──────┐  │
        │   │ AI Agents  │  │
        │   │ • Claude   │  │
        │   │ • Codex    │  │
        │   │ • etc.     │  │
        │   └────────────┘  │
        └──────────────────┘
```

### Key Principles

- The **daemon** (merged into `apps/server/`) runs on each developer machine and is the interface for ALL local agents
- The **session server** connects peers: browsers, phones, other daemons
- Data syncs via **Loro CRDT** using loro-extended adapters
- P2P sync via **WebRTC**, persistence via **LevelDB** (server) and **IndexedDB** (browser)
- Auth uses **Shipyard JWT** with native user identity — users can link multiple OAuth providers (GitHub now, Google future)

### Room Topology

| Room Type | Pattern | Purpose |
|-----------|---------|---------|
| Personal | `user:{id}` | One per user, tracks all agents across machines |
| Collaboration | `collab:{uuid}` | Ad-hoc sharing, pre-signed URL access |

### Authentication & Identity

Shipyard uses a native user identity model decoupled from any single OAuth provider:

```
ShipyardUser (D1)
  id: "usr_abc123"              -- Stable across providers
  displayName: "Jacob"
  avatarUrl: "..."

LinkedIdentity[] (D1)
  provider: "github"            -- Extensible to google, etc.
  providerId: "12345"
  providerUsername: "jacob"
```

**JWT Claims:**
```typescript
{
  sub: "usr_abc123",            // Shipyard-native ID
  displayName: "Jacob",
  providers: ["github"],
  iat: number, exp: number,
  scope?: "task:abc123",        // Agent-scoped tokens
  machineId?: "macbook-pro",    // Daemon tokens
}
```

**Login Flows:**
- **Browser:** GitHub OAuth redirect → session server → Shipyard JWT
- **CLI (daemon):** Device flow — `shipyard login` → browser OAuth → polling → JWT saved to `~/.shipyard/config.json`

**Storage:** Cloudflare D1 (edge SQLite) in the session server for users, linked identities, and device flow state.

---

## Data Model

Shipyard uses a layered data model where different types of data live in different places:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA HIERARCHY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SOURCE OF TRUTH: Distributed Loro CRDT State                   │
│  ├── Browser IndexedDB (persistent, survives refresh)           │
│  ├── Other peers' storage (distributed backup)                  │
│  └── Daemon LevelDB (while running on dev machine)              │
│                                                                 │
│  SNAPSHOTS: URLs                                                │
│  ├── Can be generated anytime from current state                │
│  ├── Shareable "save points"                                    │
│  ├── Include: task structure + annotations + status             │
│  └── Compressed via lz-string in URL query params               │
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

The actual source of truth is the distributed Loro CRDT state synced across peers. Task data lives in the CRDT, not in GitHub.

---

## Technology Choices

| Component | Choice | Key Packages |
|-----------|--------|-------------|
| CRDT | Loro | `loro-crdt`, `@loro-extended/*` (repo, adapters, react) |
| Rich text editor | TipTap v3 | `@tiptap/react`, `@tiptap/starter-kit`, `loro-prosemirror` |
| UI framework | HeroUI v3 + React | `@heroui/react`, `@heroui/styles`, Tailwind CSS v4 |
| CRDT sync (P2P) | WebRTC | `@loro-extended/adapter-webrtc` |
| CRDT sync (server) | WebSocket | `@loro-extended/adapter-websocket` |
| Persistence (server) | LevelDB | `@loro-extended/adapter-leveldb` |
| Persistence (browser) | IndexedDB | `@loro-extended/adapter-indexeddb` |
| URL compression | lz-string | `lz-string` |
| User Identity | Cloudflare D1 | `wrangler d1`, SQLite at edge |
| Auth/sessions | Shipyard JWT | `@shipyard/session`, GitHub OAuth |
| Session server | Cloudflare Workers | Durable Objects for signaling |
| MCP SDK | Official SDK | `@modelcontextprotocol/sdk` |
| API layer | Hono | `hono`, `@hono/node-server` |
| Build (apps) | tsup / Vite | `tsup` (server), `vite` (web) |
| Build (packages) | bunup | `bunup` |
| Linting | Biome | `@biomejs/biome` |
| Testing | Vitest | `vitest` |
| Package manager | pnpm | Workspace with catalogs |

---

## Project Structure

```
shipyard/
├── docs/
│   ├── architecture.md         # This file
│   ├── development.md          # Dev setup guide
│   ├── engineering-standards.md # Code standards
│   ├── decisions/              # ADRs (decision log)
│   └── whips/                  # Work-in-progress designs
├── apps/
│   ├── session-server/         # Auth + signaling (CF Workers + Durable Objects)
│   └── og-proxy-worker/        # OG meta injection for social previews
├── packages/
│   ├── loro-schema/            # Loro Shape definitions, helpers, types
│   └── session/                # Session/auth shared types and client
└── spikes/                     # Proof of concept code
```

---

## URL Encoding

Shipyard encodes task snapshots into shareable URLs using `lz-string`:

```
https://{host}/?d={compressed-data}

Where compressed-data = lz-string.compressToEncodedURIComponent(JSON.stringify({
  v: 1,                    // Version for forward compatibility
  id: "task-abc123",       // Task ID
  repo: "org/repo",        // GitHub repo for artifacts
  pr: 42,                  // PR number
  title: "...",            // Task title
  steps: [...],            // Step definitions
  artifacts: [...],        // Artifact references
  annotations: [...],      // Current annotations (snapshot)
  status: "pending_review" // Current status (snapshot)
}))
```

Safe capacity: 2-4KB compressed (all browsers), up to 10KB (modern browsers).

---

## Resilience Model

### Failure Scenarios

| Scenario | Data Lost | Recovery |
|----------|-----------|----------|
| Browser storage cleared | Local CRDT state | Sync from peers, or load URL snapshot |
| All peers offline | Nothing | Load from local IndexedDB or LevelDB |
| GitHub artifacts deleted | Binary blobs | Task + annotations intact, just missing visuals |
| User loses URL | Nothing | Generate new URL from current state |
| **Catastrophic**: All storage + no peers + no URLs | Everything | Would need to recreate |

### Why Catastrophic Loss Is Unlikely

Requires ALL of these simultaneously:
1. User's browser storage cleared
2. Daemon's LevelDB cleared
3. All peers' storage cleared
4. No URL snapshots saved anywhere (bookmarks, messages, etc.)

The distributed nature of P2P means data naturally replicates across peers.

---

## Open Decisions

These decisions can be revised as we build:

| Decision | Current Thinking | Revisable? |
|----------|------------------|------------|
| Task ID format | Hash of initial content | Yes |
| URL max size handling | Start with inline, add hash fallback if needed | Yes |
| Artifact URL pattern | `raw.githubusercontent.com/{repo}/task-artifacts/pr-{pr}/{task-id}/{file}` | Yes |

---

## References

- [loro-extended GitHub](https://github.com/SchoolAI/loro-extended)
- [TipTap documentation](https://tiptap.dev)
- [HeroUI v3 documentation](https://v3.heroui.com)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [lz-string GitHub](https://github.com/pieroxy/lz-string)

---

*Last updated: 2026-02-11*
