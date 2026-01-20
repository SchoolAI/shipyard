<div align="center">
  <img src="apps/web/public/icon.svg" alt="Shipyard Logo" width="120" height="120">
  <h1>Shipyard</h1>
  <p><strong>Verify AI agent work with collaborative review and proof-of-work artifacts</strong></p>

  <p>
    <a href="https://github.com/SchoolAI/shipyard/actions"><img src="https://img.shields.io/github/actions/workflow/status/SchoolAI/shipyard/deploy.yml?branch=main&label=deploy" alt="Deploy Status"></a>
    <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/pnpm-10.x-F69220?logo=pnpm&logoColor=white" alt="pnpm">
    <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-FSL--1.1-blue" alt="License"></a>
  </p>
</div>

---

## The Problem

AI agents can generate implementation tasks, but there's no good way to:
- **Verify** the agent actually did what it claimed
- **Review** tasks collaboratively with humans in real-time
- **Provide feedback** that agents can act on

Shipyard solves this with P2P collaborative review and proof-of-work artifacts.

## Features

- **Real-time collaboration** — Multiple reviewers sync via WebRTC, no server required
- **Proof-of-work artifacts** — Screenshots, videos, test results stored in GitHub
- **MCP integration** — Works with Claude Code, Cursor, and any MCP-compatible agent
- **Zero infrastructure** — GitHub Pages + local MCP server, no paid services
- **BlockNote editor** — Notion-like editing with inline comments and threads
- **Offline-first** — IndexedDB persistence, works without network

## Quick Start

```bash
# Clone and install
git clone https://github.com/SchoolAI/shipyard.git
cd shipyard
pnpm install

# Start development (MCP server + web app)
pnpm dev:all
```

Then configure Claude Code to use the MCP server. See **[SETUP.md](./docs/SETUP.md)** for full instructions.

## How It Works

```
┌─────────────────┐     MCP      ┌─────────────────┐
│   AI Agent      │─────────────►│  MCP Server     │
│ (Claude, etc.)  │              │  (localhost)    │
└─────────────────┘              └────────┬────────┘
                                          │ WebSocket
                                          ▼
┌─────────────────┐   WebRTC    ┌─────────────────┐
│ Remote Reviewer │◄───────────►│ Author Browser  │
│    Browser      │   (P2P)     │                 │
└─────────────────┘             └─────────────────┘
```

1. Agent creates a task via MCP tool → Browser opens automatically
2. Reviewers join via shared URL → Real-time P2P sync
3. Add comments, approve, or request changes → Agent sees feedback
4. Agent uploads artifacts (screenshots, etc.) → Stored in GitHub

## Packages

| Package | Description |
|---------|-------------|
| [`@shipyard/server`](./apps/server) | MCP server with task tools |
| [`@shipyard/web`](./apps/web) | React app with BlockNote editor |
| [`@shipyard/schema`](./packages/schema) | Shared types, Yjs helpers, URL encoding |
| [`@shipyard/signaling`](./apps/signaling) | WebRTC signaling server (Cloudflare Worker) |
| [`@shipyard/hook`](./apps/hook) | Claude Code hooks for auto-task creation |

## Documentation

| Doc | Description |
|-----|-------------|
| [SETUP.md](./docs/SETUP.md) | Installation, configuration, troubleshooting |
| [BRIEF.md](./docs/BRIEF.md) | 30-second project context |
| [architecture.md](./docs/architecture.md) | Data model, sync topology, tech choices |
| [milestones/](./docs/milestones/) | Implementation phases and progress |

## Why "Shipyard"?

The name captures two ideas:
1. **Workspace metaphor** — A shipyard is where work is built
2. **Dev culture** — "Shipping" is how developers talk about delivering value

The Penrose triangle logo represents the "impossible triangle" of AI development: **quality**, **speed**, and **low effort**. Traditionally you sacrifice one. Shipyard enables all three through collaborative verification loops.

> *See [ADR-0005](./docs/decisions/0005-rebrand-peer-plan-to-shipyard.md) for the full naming rationale.*

## Claude Cowork Integration

Use Shipyard with Claude Cowork via the included skill:

```
shipyard-skill/
├── SKILL.md      # Instructions for Claude
├── README.md     # Setup guide
└── examples/     # Usage examples
```

See [shipyard-skill/README.md](./shipyard-skill/README.md) for setup.

## Contributing

We welcome contributions! Please read the codebase first:

1. [BRIEF.md](./docs/BRIEF.md) — Understand the project
2. [engineering-standards.md](./docs/engineering-standards.md) — Code quality expectations
3. [architecture.md](./docs/architecture.md) — How it all fits together

## License

[FSL-1.1-ALv2](./LICENSE.md) (Functional Source License)

- **Free** for all non-competing use
- **Converts to Apache 2.0** automatically in 2 years

We chose this to ensure that all core improvements help grow this main repository while keeping it free for developers.

---

<div align="center">
  <sub>Built with Yjs, BlockNote, and the MCP protocol</sub>
</div>
