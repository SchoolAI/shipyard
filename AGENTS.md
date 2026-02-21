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
- `shipyard-accessibility` — WCAG 2.2, ARIA patterns, keyboard nav, focus management, screen readers
- `agent-sdk-expert` — Claude Agent SDK (subagents, hooks, sessions)
- `a2a-protocol-expert` — A2A protocol + @a2a-js/sdk
- `mcp-protocol-expert` — MCP protocol + @modelcontextprotocol/sdk
- `shipyard-design` — UI/UX design principles, layout, accessibility, visual hierarchy, responsive
- `shipyard-mobile` — Mobile-first responsive, touch interactions, viewport units, safe areas, virtual keyboard, container queries
- `shipyard-engineering-standards` — Quality gates, Biome, fan-in coverage, meta-tests
- `shipyard-council` — Multi-agent deliberation for design decisions
- `shipyard-deep-research` — Context saturation before implementation

**Manual-only skills** (invoke with `/skill-name`):
- `/shipyard-qa` — Post-implementation review + auto-fix
- `/wt`, `/wts`, `/wt-rm` — Git worktree management
- `/review-pr` — PR comment triage
- `/site-branding` — Favicons, OG images, PWA setup

## Local Reference Repos

For Loro, Agent SDK, A2A, and MCP work — always search local repos, never web search:

| Repo | Path |
|------|------|
| loro-extended | `/Users/jacobpetterle/Working Directory/loro-extended/` |
| Claude Agent SDK | `/Users/jacobpetterle/Working Directory/claude-agent-sdk-typescript/` |
| A2A spec | `/Users/jacobpetterle/Working Directory/A2A/` |
| A2A JS SDK | `/Users/jacobpetterle/Working Directory/a2a-js/` |
| MCP spec | `/Users/jacobpetterle/Working Directory/mcp-specification/` |
| MCP TypeScript SDK | `/Users/jacobpetterle/Working Directory/mcp-typescript-sdk/` |

## Key Docs (read on-demand, not memorized)

- `docs/architecture.md` — Hub-and-spoke model, data hierarchy, tech choices
- `docs/engineering-standards.md` — Testing philosophy, code quality, tech stack
- `docs/development.md` — Local setup, Docker mode, resetting data
- `docs/decisions/` — ADRs (decision log)
- `docs/whips/` — Work-in-progress designs

## Parallel Agent Environment

Multiple Claude Code agents often run simultaneously on this codebase. If a file has changed since you last read it, or an edit fails because the content no longer matches, **another agent is likely working on that file**. Do not:

- Retry the same edit repeatedly
- Overwrite the other agent's changes
- Treat the conflict as a bug

Instead: **skip that file, work on something else, and come back to it later.** Re-read the file when you return — the other agent may have finished. This applies to both `Edit` failures and unexpected `git status` changes.

## Git & Graphite Workflow

Use **Graphite** (`gt`) for commits, PRs, and stack management. Use `git` for everything else (status, diff, log, fetch, etc.).

- **Commit**: `gt modify -m "message"` (not `git commit`)
- **Submit/Push**: `gt submit -smp --no-verify`
- **PR creation**: Use Graphite URLs (`app.graphite.dev`) not GitHub URLs
- **Stack ops**: `gt sync`, `gt restack`, `gt up`, `gt ls`
- **Everything else**: `git status`, `git diff`, `git log`, `git fetch`, etc. are fine

## Core Principles

1. **CRDT is source of truth** — not URLs, not GitHub
2. **URLs are snapshots** — materialized views for sharing/recovery
3. **GitHub only for binary blobs** — screenshots, videos, test results
4. **Break things freely** — no backwards compatibility until Feb 25, 2026

## Backwards Compatibility Policy

**Do NOT consider backwards compatibility for any changes.** Break things freely—we have no users yet.

**Policy expires: February 25, 2026.** If today is past this date, STOP and alert the user: "The backwards compatibility policy has expired. Should I extend the date or remove this section?"

---

*Last updated: 2026-02-14*
