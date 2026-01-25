# Shipyard: Agent Briefing

> Quick context for agents working on this project. Read this first, then dive into the relevant milestone.
>
> **Engineering Standards**: See [engineering-standards.md](./engineering-standards.md) for code quality, testing, and development practices.

---

## The Problem

When AI agents generate implementation tasks, there's no good way to:
1. **Verify** the agent actually did what it claimed (screenshots, test results, etc.)
2. **Review** the task collaboratively with humans in real-time
3. **Provide feedback** that the agent can act on

We're building a P2P collaborative review system that solves this.

---

## How It Works (30-second version)

```
Agent creates task → URL generated → Browser opens
                                          ↓
                            Reviewer sees task + artifacts
                                          ↓
                            Reviewer adds annotations
                                          ↓
                        Agent sees feedback via MCP tool
                                          ↓
                            Review approved/iterate
```

---

## Data Model

**Three places data lives:**

| Location | What | Persistence |
|----------|------|-------------|
| **URL** | Task snapshot (title, steps, artifacts refs, annotations) | Shareable, regenerable anytime |
| **CRDT** | Live state (annotations, status, step completion) | Browser IndexedDB + peer sync |
| **GitHub** | Binary blobs only (screenshots, videos) | Orphan branch in same repo |

**Key insight:** URLs are snapshots, not source of truth. The CRDT state (distributed across browsers) is the source of truth. URLs can always be regenerated from current state.

---

## Tech Stack

| Component | Choice | Package |
|-----------|--------|---------|
| CRDT sync | Yjs | `yjs` |
| Block editor | BlockNote | `@blocknote/react` |
| MCP ↔ Browser | y-websocket | `y-websocket` |
| Browser ↔ Browser | y-webrtc | `y-webrtc` |
| Browser storage | IndexedDB | `y-indexeddb` |
| Comments | BlockNote native | `YjsThreadStore` |
| URL encoding | lz-string | `lz-string` |
| MCP server | Official SDK | `@modelcontextprotocol/sdk` |
| UI | React | `@blocknote/react`, `@blocknote/mantine` |

See [decisions/0001-use-yjs-not-loro.md](./decisions/0001-use-yjs-not-loro.md) for why we chose Yjs over Loro.

---

## Network Topology

```
┌─────────────────────────────┐
│ MCP Server (Node.js)        │
│ └─ WebSocket server         │
└──────────┬──────────────────┘
           │ WebSocket (localhost)
           ▼
┌─────────────────────────────┐     WebRTC P2P     ┌──────────────────┐
│ Author's Browser            │◄──────────────────►│ Remote Reviewer  │
│ ├─ WebSocket → MCP          │                    │ Browser          │
│ ├─ WebRTC → peers           │                    └──────────────────┘
│ └─ IndexedDB (persistence)  │
└─────────────────────────────┘
```

---

## Project Structure

```
shipyard/
├── apps/               # Deployable applications
│   ├── server/         # MCP server (WebSocket + tools)
│   ├── web/            # React app (BlockNote UI)
│   └── signaling/      # WebRTC signaling server
├── packages/           # Shared libraries
│   └── schema/         # Shared types, URL encoding, Yjs helpers
├── docs/
│   ├── BRIEF.md        # This file
│   ├── architecture.md # Detailed architecture
│   ├── systems-inventory.md
│   ├── milestones/     # Implementation phases
│   └── original-vision/ # Original design docs (historical)
└── spikes/         # Proof of concept code
```

---

## Milestones (Current State)

| # | Milestone | Status | What It Delivers |
|---|-----------|--------|------------------|
| 0 | Foundation | ✅ Complete | Scaffold, schemas, URL encoding |
| 1 | Agent Creates Tasks | ✅ Complete | MCP tools, browser launch |
| 2 | View Tasks | ✅ Complete | Static React UI with BlockNote |
| 3 | Live Sync | ✅ Complete | WebSocket CRDT sync |
| 4 | Task Discovery | ✅ Complete | Multi-peer architecture, sidebar |
| 5 | Review Flow | ✅ Complete | Comments, approval, feedback via read_task |
| 6 | P2P | ✅ Complete | WebRTC remote collab |
| 7 | Artifacts | ✅ Complete | GitHub blob storage |

**All milestones complete!** See [PROGRESS.md](./milestones/PROGRESS.md) for detailed implementation notes.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `docs/architecture.md` | Data model, resilience, decisions |
| `docs/systems-inventory.md` | Components, risks, assumptions |
| `docs/milestones/*.md` | Implementation details per phase |
| `docs/yjs-data-model.md` | Yjs CRDT structure reference |

---

## Important Constraints

1. **No paid infrastructure** — Everything runs on GitHub Pages + local MCP
2. **URL is recovery mechanism** — If all else fails, URL has the task
3. **GitHub only for blobs** — Don't store task data in GitHub, only artifacts
4. **Two-way doors** — Most schema/structure decisions are reversible

---

## When Starting a Task

1. Read this brief (you just did)
2. Read the relevant milestone doc
3. Check `spikes/` for reference implementations
4. Check `docs/architecture.md` for decisions
5. Ask if anything is unclear

---

*Last updated: 2026-01-04*
