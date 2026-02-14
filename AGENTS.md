# Shipyard Agent Instructions

> Human-agent collaboration workspace with proof-of-work tracking.

## Lay of the Land

```
apps/
├── session-server/  # Auth + signaling (Cloudflare Workers + Durable Objects)
└── og-proxy-worker/ # OG meta injection for social previews
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

## Task Tool Bug Workaround

**Always use `run_in_background: true`** on all Task tool calls. There is a known Claude Code bug ([#22087](https://github.com/anthropics/claude-code/issues/22087)) where `classifyHandoffIfNeeded is not defined` crashes agents at completion. The bug is in the ctrl+b "move to background" handler — starting agents in background mode from the beginning bypasses it. Use `Read` on the `output_file` to retrieve results.

## Skills & Subagents

Domain expertise is in skills — use subagents to keep the main context clean.

**Auto-triggered skills** (loaded when relevant):
- `loro-expert` — Loro Shapes, TypedDocs, Repo, adapters, React hooks
- `tiptap-expert` — TipTap extensions, ProseMirror, loro-prosemirror bridge
- `heroui-expert` — HeroUI v3 compound components, React Aria patterns
- `accessibility` — WCAG 2.2, ARIA patterns, keyboard nav, focus management, screen readers
- `agent-sdk-expert` — Claude Agent SDK (subagents, hooks, sessions)
- `a2a-protocol-expert` — A2A protocol + @a2a-js/sdk
- `design` — UI/UX design principles, layout, accessibility, visual hierarchy, responsive
- `mobile` — Mobile-first responsive, touch interactions, viewport units, safe areas, virtual keyboard, container queries
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

*Last updated: 2026-02-13*
