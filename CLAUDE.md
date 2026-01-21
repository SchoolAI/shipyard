# Claude Code Instructions for Shipyard

> Instructions for AI agents working on this codebase.

## Documentation Structure

- **[README.md](./README.md)** — Project overview only (not a runbook)
- **[docs/SETUP.md](./docs/SETUP.md)** — **Runbook**: How to start the app, common operations, troubleshooting
- **[docs/](./docs/)** — Architecture, design decisions, milestones

**README is NOT documentation** — it's just the project introduction. For operational tasks (setup, reset, troubleshooting), always use SETUP.md.

## Before Starting Any Task

**Always read these docs first:**

1. **[docs/BRIEF.md](./docs/BRIEF.md)** — 30-second project context (problem, architecture, tech stack)
2. **[docs/engineering-standards.md](./docs/engineering-standards.md)** — Code quality, testing, development practices
3. **[docs/architecture.md](./docs/architecture.md)** — Current architecture and data model
4. **Relevant milestone** — See [docs/milestones/](./docs/milestones/) for the phase you're working on

## Current Status

**Milestone:** All 7 core milestones complete! 🎉
**Phase:** Active enhancements and bug fixes

See [docs/milestones/PROGRESS.md](./docs/milestones/PROGRESS.md) for full implementation details.

## Distribution

Shipyard is distributed in two ways:

- **Claude Code:** GitHub plugin via `/plugin install SchoolAI/shipyard` (includes MCP + hooks + skills)
- **Other platforms:** npm package `@schoolai/shipyard-mcp` (MCP server only)

See [docs/INSTALLATION.md](./docs/INSTALLATION.md) for platform-specific setup instructions.

## Tech Stack (Quick Reference)

- **CRDT:** Yjs (not Loro) — See [ADR-0001](./docs/decisions/0001-use-yjs-not-loro.md)
- **Block Editor:** BlockNote (Notion-like)
- **UI Components:** HeroUI v3 (React) — See [HeroUI v3 Guidelines](#heroui-v3-guidelines) below
- **Sync:** y-websocket (MCP↔browser), y-webrtc (P2P)
- **Build:** pnpm + tsup + Biome (switched from tsdown due to workspace bundling issues)
- **Testing:** Vitest with fan-in based coverage

## HeroUI v3 Guidelines

**Version:** v3.0.0 (beta) — Requires **Tailwind CSS v4** (not v3)

**Documentation:** https://v3.heroui.com/react/llms.txt

### Key Principles

- **Accessibility First** — Built on React Aria Components with full a11y support
- **Composition Pattern** — Use compound components (e.g., `<Card><Card.Header>...</Card.Header></Card>`)
- **React Server Components** — Supported since v3.0.0-alpha.35
- **No Provider Required** — Unlike v2, HeroUI v3 works directly without a Provider wrapper

### Critical Usage Notes

1. **Use compound components** — v3 uses `<Card.Header>` pattern, NOT flat props like v2's `<Card title="...">`
2. **Use `onPress` not `onClick`** — React Aria uses `onPress` for button interactions
3. **Check component availability** — v3 is beta; some v2 components may not exist yet
4. **Form components** — Use TextField, RadioGroup, Fieldset, etc. with built-in validation

### Before Using a Component

Always verify the component exists and check its v3 API:
- **Use the HeroUI MCP server** (preferred) — Available tools for up-to-date docs:
  - `mcp__heroui-react__list_components` — See all available v3 components
  - `mcp__heroui-react__get_component_info` — Get component anatomy and props
  - `mcp__heroui-react__get_component_examples` — Get working code examples
  - `mcp__heroui-react__installation` — Get framework-specific setup instructions
- Reference https://v3.heroui.com for web docs
- Don't assume v2 patterns work in v3

## Project Structure

```
shipyard/
├── docs/
│   ├── BRIEF.md                # Start here
│   ├── engineering-standards.md # Code standards
│   ├── architecture.md         # Current architecture
│   ├── decisions/              # ADRs (decision log)
│   ├── milestones/             # Implementation phases
│   └── original-vision/        # Historical (don't use for impl)
├── apps/               # Deployable applications
│   ├── server/         # MCP server (WebSocket + tools)
│   ├── web/            # React app (BlockNote UI)
│   └── signaling/      # WebRTC signaling server
├── packages/           # Shared libraries
│   └── schema/         # Shared types, URL encoding, Yjs helpers
└── spikes/         # Proof of concept code
```

## Key Architectural Principles

1. **URLs are snapshots, not source of truth** — Y.Doc (distributed) is truth, URLs are recovery/sharing
2. **GitHub only for binary blobs** — Plan data lives in CRDT, not GitHub
3. **BlockNote handles comments** — Don't build custom annotation system
4. **Single WebSocket** — All sync (content, metadata, comments) on one connection

## Backwards Compatibility Policy

**Do NOT consider backwards compatibility for any changes.** Break things freely—we have no users yet.

**Policy expires: January 20, 2026.** If today is past this date, STOP and alert the user: "The backwards compatibility policy has expired. Should I extend the date or remove this section?"

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

*Last updated: 2026-01-14*
