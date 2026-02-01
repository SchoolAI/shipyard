# Shipyard Agent Instructions

> Instructions for AI agents working on this codebase.

## Before Starting Any Task

**Always read these docs first:**

1. **[docs/architecture.md](./docs/architecture.md)** — Current architecture and data model
2. **[docs/engineering-standards.md](./docs/engineering-standards.md)** — Code quality, testing, development practices
3. **[docs/development.md](./docs/development.md)** — Local setup and development workflow

## Tech Stack (Quick Reference)

- **CRDT:** Yjs (not Loro) — See [ADR-0001](./docs/decisions/0001-use-yjs-not-loro.md)
- **Block Editor:** BlockNote (Notion-like)
- **UI Components:** HeroUI v3 (React) — See [HeroUI v3 Guidelines](#heroui-v3-guidelines) below
- **Sync:** y-websocket (MCP↔browser), y-webrtc (P2P)
- **Build:** pnpm + tsup + Biome
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

## Loro Reference (Local Repository)

**Path:** `/Users/jacobpetterle/Working Directory/loro-extended`

For any Loro-related work (CRDT internals, API reference, examples, types), **always search the local loro-extended repository**. Never use web search for Loro documentation—the local copy is faster and more reliable.

### Setup

If the repository is not cloned, clone it first:

```bash
cd "/Users/jacobpetterle/Working Directory"
git clone https://github.com/SchoolAI/loro-extended.git
```

### Usage

When you need Loro information:
1. **Search the local repo** — Use Glob/Grep on `/Users/jacobpetterle/Working Directory/loro-extended`
2. **Check examples** — Look in `examples/` or `tests/` directories
3. **Check types** — Look in `src/` for TypeScript definitions
4. **Never web search** — The local copy has everything you need

### Why Local Over Web

- **Faster** — No network latency, instant file access
- **Complete** — Full source code, not just docs
- **Reliable** — Always available, no rate limits
- **Searchable** — Grep through entire codebase

## Project Structure

```
shipyard/
├── docs/
│   ├── architecture.md         # Current architecture
│   ├── development.md          # Dev setup guide
│   ├── engineering-standards.md # Code standards
│   ├── decisions/              # ADRs (decision log)
│   └── whips/                  # Work-in-progress designs
├── apps/                       # Deployable applications
│   ├── server/                 # MCP server (WebSocket + tools)
│   ├── web/                    # React app (BlockNote UI)
│   ├── hook/                   # Claude Code hooks
│   ├── daemon/                 # Agent launcher daemon
│   └── signaling/              # WebRTC signaling server
├── packages/                   # Shared libraries
│   ├── schema/                 # Shared types, URL encoding, Yjs helpers
│   └── shared/                 # Shared instructions, constants
└── spikes/                     # Proof of concept code
```

## Key Architectural Principles

1. **URLs are snapshots, not source of truth** — Y.Doc (distributed) is truth, URLs are recovery/sharing
2. **GitHub only for binary blobs** — Plan data lives in CRDT, not GitHub
3. **BlockNote handles comments** — Don't build custom annotation system
4. **Single WebSocket** — All sync (content, metadata, comments) on one connection

## Backwards Compatibility Policy

**Do NOT consider backwards compatibility for any changes.** Break things freely—we have no users yet.

**Policy expires: February 15, 2026.** If today is past this date, STOP and alert the user: "The backwards compatibility policy has expired. Should I extend the date or remove this section?"

## Common Tasks

### Starting New Work

1. Read architecture.md for current state
2. Check docs/decisions/ for relevant ADRs
3. Follow engineering-standards.md patterns

### Making Architectural Decisions

1. Create new ADR in docs/decisions/ using template
2. Update architecture.md with new state
3. Link ADR from architecture.md
4. Never edit old ADRs (create new one that supersedes)

### Adding Dependencies

Check engineering-standards.md for approved stack. Use:
- Biome (not ESLint)
- Vitest (not Jest)
- tsup (not other bundlers)
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

*Last updated: 2026-01-31*
