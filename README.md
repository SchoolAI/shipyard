<div align="center">
  <h1>Shipyard</h1>
  <p><strong>Ship responsibly.</strong></p>
  <p>Agent management hub for human-agent collaboration.</p>

  <p>
    <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-FSL--1.1-blue" alt="License"></a>
  </p>
</div>

---

## The Problem

You're managing multiple AI agents (Claude, Cursor, Devin), but there's no workspace where humans and agents collaborate together:
- **No verification** — Agent says "done" but you have no proof
- **No collaboration layer** — Humans review in GitHub, agents work in chat logs
- **No feedback loop** — You approve work, but the agent never sees it

Shipyard is the collaboration workspace for mixed human-agent teams. Agents create tasks with proof. Humans review in real-time. Feedback flows both ways.

## How It Works

```
                          ┌──────────────────────────┐
                          │   Session Server          │
                          │   (CF Workers + Durable   │
                          │    Objects)                │
                          │   • Auth (Shipyard JWT)    │
                          │   • WebRTC signaling       │
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
        │  └─────┬──────┘  │  └───────────────┘  └───────────────┘
        │        │ MCP     │
        │   ┌────▼──────┐  │         All peers sync via
        │   │ AI Agents  │  │         Loro CRDT over WebRTC
        │   └────────────┘  │
        └──────────────────┘
```

1. **Agent creates task** via MCP → Browser opens automatically
2. **Reviewers join** via shared URL → Real-time P2P sync
3. **Add comments**, approve, or request changes → Agent sees feedback
4. **Agent uploads artifacts** (screenshots, videos) as proof of work
5. **Task auto-completes** when all deliverables have receipts

## Current State

Shipyard is in active development. The MCP server and web app are being rebuilt on a clean foundation:

| Component | Description |
|-----------|-------------|
| [**Session Server**](./apps/session-server) | Auth + WebRTC signaling (Cloudflare Workers + Durable Objects) |
| [**OG Proxy**](./apps/og-proxy-worker) | Open Graph meta tags for social link previews |
| [**Loro Schema**](./packages/loro-schema) | CRDT Shape definitions, typed documents, helpers |
| [**Session**](./packages/session) | Session/auth shared types and client |

**Tech stack:** Loro CRDT (loro-extended), TipTap editor, HeroUI v3, Tailwind v4, Cloudflare Workers

## Data & Privacy

| Data | Where It Lives | Control |
|------|---------------|---------|
| Task content | Browser (IndexedDB) + P2P sync | You own it |
| Artifacts | Optional: GitHub (your repo, orphan branch) | You own it |
| MCP server | Runs locally | Never leaves your machine |
| URLs | Encoded snapshots | Shareable, regenerable |

**No telemetry. No cloud storage. GitHub optional.**

## Documentation

| Doc | Description |
|-----|-------------|
| **[Development](./docs/development.md)** | Local setup, running services |
| **[Architecture](./docs/architecture.md)** | Data model, sync topology, tech choices |
| **[Engineering Standards](./docs/engineering-standards.md)** | Code quality, testing philosophy |

## Contributing

We value **ideas over implementations**. Please start with discussion:

1. **Bug reports** — [Open an issue](https://github.com/SchoolAI/shipyard/issues/new)
2. **Feature ideas** — [Start a discussion](https://github.com/SchoolAI/shipyard/discussions/new)
3. **Questions** — [Ask in discussions](https://github.com/SchoolAI/shipyard/discussions)

PRs without a linked, approved issue may be closed. AI-assisted contributions are welcome — what matters is that **you** understand what you're submitting.

## License

[FSL-1.1-ALv2](./LICENSE.md) (Functional Source License)

- **Free** for all non-competing use
- **Converts to Apache 2.0** automatically in 2 years
