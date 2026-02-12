# Shipyard Agent Instructions

> Human-agent collaboration workspace with proof-of-work tracking.

## Lay of the Land

```
apps/
├── server/          # MCP server + daemon (Loro persistence, agent spawning)
├── web/             # React app (TipTap editor, HeroUI v3, Tailwind v4)
├── hook/            # Claude Code hooks
├── session-server/  # Auth + signaling (Cloudflare Workers + Durable Objects)
├── og-proxy-worker/ # OG meta injection for social previews
└── mcp-proxy/       # MCP proxy
packages/
├── loro-schema/     # Loro Shape definitions, helpers, types
└── session/         # Session/auth shared types and client
```

## Tech Stack

- **CRDT:** Loro via `loro-extended` (NOT Yjs)
- **Editor:** TipTap + `loro-prosemirror` (NOT BlockNote)
- **UI:** HeroUI v3 (beta) + Tailwind CSS v4
- **Sync:** `@loro-extended/adapter-*` (WebSocket, WebRTC, LevelDB, IndexedDB)
- **Build:** pnpm + tsup + Biome (NOT ESLint)
- **Testing:** Vitest with fan-in based coverage

## Skills & Subagents

Domain expertise is in skills — use subagents to keep the main context clean.

**Auto-triggered skills** (loaded when relevant):
- `loro-expert` — Loro Shapes, TypedDocs, Repo, adapters, React hooks
- `tiptap-expert` — TipTap extensions, ProseMirror, loro-prosemirror bridge
- `heroui-expert` — HeroUI v3 compound components, React Aria patterns
- `agent-sdk-expert` — Claude Agent SDK (subagents, hooks, sessions)
- `a2a-protocol-expert` — A2A protocol + @a2a-js/sdk
- `engineering-standards` — Quality gates, Biome, fan-in coverage, meta-tests
- `council` — Multi-agent deliberation for design decisions
- `deep-research` — Context saturation before implementation

**Manual-only skills** (invoke with `/skill-name`):
- `/wt`, `/wts`, `/wt-rm` — Git worktree management
- `/review-pr` — PR comment triage
- `/site-branding` — Favicons, OG images, PWA setup

## Local Reference Repos

For Loro, Agent SDK, and A2A work — always search local repos, never web search:

| Repo | Path |
|------|------|
| loro-extended | `/Users/jacobpetterle/Working Directory/loro-extended/` |
| Claude Agent SDK | `/Users/jacobpetterle/Working Directory/claude-agent-sdk-typescript/` |
| A2A spec | `/Users/jacobpetterle/Working Directory/A2A/` |
| A2A JS SDK | `/Users/jacobpetterle/Working Directory/a2a-js/` |

## Key Docs (read on-demand, not memorized)

- `docs/architecture.md` — Hub-and-spoke model, data hierarchy, tech choices
- `docs/engineering-standards.md` — Testing philosophy, code quality, tech stack
- `docs/development.md` — Local setup, Docker mode, resetting data
- `docs/decisions/` — ADRs (decision log)
- `docs/whips/` — Work-in-progress designs

## Core Principles

1. **CRDT is source of truth** — not URLs, not GitHub
2. **URLs are snapshots** — materialized views for sharing/recovery
3. **GitHub only for binary blobs** — screenshots, videos, test results
4. **Break things freely** — no backwards compatibility until Feb 15, 2026

## Backwards Compatibility Policy

**Do NOT consider backwards compatibility for any changes.** Break things freely—we have no users yet.

**Policy expires: February 15, 2026.** If today is past this date, STOP and alert the user: "The backwards compatibility policy has expired. Should I extend the date or remove this section?"

---

*Last updated: 2026-02-11*
