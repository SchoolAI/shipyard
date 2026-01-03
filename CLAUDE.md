# Claude Code Instructions for Peer-Plan

> Instructions for AI agents working on this codebase.

## Before Starting Any Task

**Always read these docs first:**

1. **[docs/BRIEF.md](./docs/BRIEF.md)** — 30-second project context (problem, architecture, tech stack)
2. **[docs/engineering-standards.md](./docs/engineering-standards.md)** — Code quality, testing, development practices
3. **[docs/architecture.md](./docs/architecture.md)** — Current architecture and data model
4. **Relevant milestone** — See [docs/milestones/](./docs/milestones/) for the phase you're working on

## Current Status

**Milestone:** 0 (Foundation)
**Phase:** Setting up schemas, monorepo, URL encoding

See [docs/milestones/00-foundation.md](./docs/milestones/00-foundation.md) for current work.

## Tech Stack (Quick Reference)

- **CRDT:** Yjs (not Loro) — See [ADR-0001](./docs/decisions/0001-use-yjs-not-loro.md)
- **Block Editor:** BlockNote (Notion-like)
- **Sync:** y-websocket (MCP↔browser), y-webrtc (P2P)
- **Build:** pnpm + tsdown + Biome
- **Testing:** Vitest with fan-in based coverage

## Project Structure

```
peer-plan/
├── docs/
│   ├── BRIEF.md                # Start here
│   ├── engineering-standards.md # Code standards
│   ├── architecture.md         # Current architecture
│   ├── decisions/              # ADRs (decision log)
│   ├── milestones/             # Implementation phases
│   └── original-vision/        # Historical (don't use for impl)
├── packages/
│   ├── schema/     # Shared types, URL encoding
│   ├── server/     # MCP server
│   └── web/        # React app
└── spikes/         # Proof of concept code
```

## Key Architectural Principles

1. **URLs are snapshots, not source of truth** — Y.Doc (distributed) is truth, URLs are recovery/sharing
2. **GitHub only for binary blobs** — Plan data lives in CRDT, not GitHub
3. **BlockNote handles comments** — Don't build custom annotation system
4. **Single WebSocket** — All sync (content, metadata, comments) on one connection

## Common Tasks

### Starting New Work

1. Read BRIEF.md + current milestone
2. Check docs/decisions/ for relevant ADRs
3. Follow engineering-standards.md patterns
4. Update relevant milestone checklist as you work

### Making Architectural Decisions

1. Create new ADR in docs/decisions/ using template
2. Update architecture.md with new state
3. Link ADR from architecture.md
4. Never edit old ADRs (create new one that supersedes)

### Adding Dependencies

Check engineering-standards.md for approved stack. Use:
- Biome (not ESLint)
- Vitest (not Jest)
- tsdown (not tsup)
- pnpm (not npm/yarn)

## Testing Philosophy

Follow the **3+ Rule** from engineering-standards.md:
- Code used in 3+ places needs interface tests
- Target 30% per-file function coverage (not 100%)
- Tests should rarely change

## When Stuck

1. Check spikes/ for working examples
2. Check docs/decisions/ for context on choices
3. Ask user for clarification (don't guess)

---

*Last updated: 2026-01-02*
