# Peer-Plan Documentation

## Start Here

**[BRIEF.md](./BRIEF.md)** — Quick context for agents/contributors. Read this first.

## Quick Links

- [Architecture](./architecture.md) - Data model, network topology, technology choices
- [Systems Inventory](./systems-inventory.md) - Components, assumptions, risks
- [Milestones](#milestones) - Implementation phases

---

## Overview

Peer-Plan is a P2P collaborative review system for AI-generated implementation plans. It enables:
- Real-time collaboration between AI agents and human reviewers
- Agent verifiability through artifacts (screenshots, test results)
- Zero-infrastructure deployment (GitHub Pages + local MCP)

See [original-vision/](./original-vision/) for the initial design docs (historical reference).

---

## Milestones

| # | Milestone | Description | Status |
|---|-----------|-------------|--------|
| 0 | [Foundation](./milestones/00-foundation.md) | Scaffold, schemas, URL encoding | ✅ Complete |
| 1 | [Agent Creates Plans](./milestones/01-agent-creates-plans.md) | MCP server, browser launch | ✅ Complete |
| 2 | [View Plans](./milestones/02-view-plans.md) | BlockNote UI, shadcn/ui | ✅ Complete |
| 3 | [Live Sync](./milestones/03-live-sync.md) | WebSocket sync, IndexedDB | ✅ Complete |
| 4 | [Plan Discovery](./milestones/04-review-flow.md) | Multi-peer architecture, sidebar | ✅ Complete |
| 5 | [Review Flow](./milestones/04-review-flow.md) | Annotations, approval | ✅ Complete |
| 6 | [P2P](./milestones/06-p2p.md) | WebRTC remote collaboration | ✅ Complete |
| 7 | [Artifacts](./milestones/05-artifacts.md) | GitHub blob storage | ✅ Complete |

**Note**: Milestone files 04/05/06 were reordered during development. See [PROGRESS.md](./milestones/PROGRESS.md) for chronological implementation details.

### Demo Checkpoints

- **After Milestone 1**: Claude creates plan → browser opens with URL
- **After Milestone 2**: Share URL → anyone can view plan
- **After Milestone 4**: Complete review cycle works locally
- **After Milestone 6**: Remote reviewers collaborate in real-time

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CRDT library | Yjs | Production-ready, excellent ecosystem (see ADR-0001) |
| Block editor | BlockNote | Notion-like editor with native comment support |
| MCP ↔ Browser | y-websocket | Mature Yjs WebSocket provider |
| Browser ↔ Browser | y-webrtc | P2P sync for remote collaboration |
| Browser storage | y-indexeddb | Official Yjs IndexedDB persistence |
| URL encoding | lz-string | Purpose-built, widely used |
| Artifact storage | GitHub orphan branch | Same repo, same permissions |

---

## Directory Structure

```
peer-plan/
├── docs/                    # You are here
│   ├── README.md           # This file
│   ├── BRIEF.md            # Agent briefing (start here)
│   ├── architecture.md     # Technical architecture
│   ├── systems-inventory.md # Components and risks
│   ├── milestones/         # Implementation phases
│   └── original-vision/    # Initial design docs (historical)
├── apps/                    # Deployable applications
│   ├── server/             # MCP server (WebSocket + tools)
│   ├── web/                # React app (BlockNote UI)
│   └── signaling/          # WebRTC signaling server
├── packages/                # Shared libraries
│   └── schema/             # Shared types, URL encoding, Yjs helpers
└── spikes/                  # Proof of concept code
```

---

## Getting Started

See [Milestone 0: Foundation](./milestones/00-foundation.md) for the first implementation steps.

---

*Last updated: 2026-01-04*
