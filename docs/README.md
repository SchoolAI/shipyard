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

| Phase | Milestone | Description | Status |
|-------|-----------|-------------|--------|
| 0 | [Foundation](./milestones/00-foundation.md) | Scaffold, schemas, URL encoding | ✅ Complete |
| 1 | [Agent Creates Plans](./milestones/01-agent-creates-plans.md) | MCP server, browser launch | ✅ Complete |
| 2 | [View Plans](./milestones/02-view-plans.md) | BlockNote UI, shadcn/ui | 🚧 In Progress |
| 3 | [Live Sync](./milestones/03-live-sync.md) | WebSocket sync, IndexedDB | Not Started |
| 4 | [Review Flow](./milestones/04-review-flow.md) | Annotations, approval | Not Started |
| 5 | [Artifacts](./milestones/05-artifacts.md) | GitHub blob storage | Not Started |
| 6 | [P2P](./milestones/06-p2p.md) | WebRTC remote collaboration | Not Started |

### Demo Checkpoints

- **After Milestone 1**: Claude creates plan → browser opens with URL
- **After Milestone 2**: Share URL → anyone can view plan
- **After Milestone 4**: Complete review cycle works locally
- **After Milestone 6**: Remote reviewers collaborate in real-time

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CRDT library | loro-extended | Validated in spike, has WebSocket/WebRTC adapters |
| MCP ↔ Browser | WebSocket | No polyfills needed, validated in spike |
| URL encoding | lz-string | Purpose-built, widely used (itty.bitty, etc.) |
| Browser storage | IndexedDB | loro-extended has adapter |
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
├── spikes/                  # Proof of concept code
│   └── loro-websocket/     # WebSocket sync spike (validated)
└── packages/                # Implementation (future)
    ├── schema/
    ├── server/
    └── web/
```

---

## Getting Started

See [Milestone 0: Foundation](./milestones/00-foundation.md) for the first implementation steps.

---

*Last updated: 2026-01-02*
