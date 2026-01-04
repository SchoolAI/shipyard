# Milestone Progress

Quick reference for current implementation status.

---

## Milestone 0: Foundation ✅ COMPLETE

**Completed:**
- ✅ Monorepo with pnpm workspaces + Turborepo
- ✅ `@peer-plan/schema` package (URL encoding, Yjs helpers, types)
- ✅ ADR system (decision 0001: Yjs + BlockNote)
- ✅ Maximum strictness (Biome v2, TypeScript strict, pre-commit hooks)
- ✅ Engineering standards documented
- ✅ Agent onboarding (CLAUDE.md, SessionStart hook)

**Key decisions:**
- CRDT: Yjs (not Loro)
- Block editor: BlockNote
- Build: tsdown, Biome, Vitest, Turborepo

---

## Milestone 1: Agent Creates Plans ✅ COMPLETE

**Completed:**
- ✅ MCP server with `create_plan` tool
- ✅ Basic web UI (decodes URL, displays plan)
- ✅ Pino logging (stderr-safe for MCP)
- ✅ End-to-end flow validated

**Demo:**
```
Claude: "Create a plan for adding dark mode"
→ MCP tool creates plan
→ Browser opens with URL
→ Plan displays (JSON rendering)
```

---

## Milestone 2: View Plans ✅ COMPLETE

**Goal:** Professional UI with BlockNote editor + Tailwind/shadcn

**Completed:**
- ✅ Tailwind CSS v4 + shadcn/ui setup
- ✅ BlockNote read-only editor for content
- ✅ Mantine + Tailwind hybrid (CSS layer ordering)
- ✅ PlanHeader component (shadcn Card + Badge)
- ✅ PlanViewer component (BlockNote read-only)
- ✅ Full layout with Tailwind utilities

**Tech stack:**
- Tailwind CSS v4 (via @tailwindcss/vite)
- shadcn/ui (Card, Badge, Button, Separator)
- BlockNote v0.45 + Mantine v7
- CSS import order: BlockNote → Mantine → Tailwind

---

## Milestone 3: Live Sync ✅ COMPLETE

**Goal:** Real-time sync between MCP server and browser

**Completed:**
- ✅ y-websocket server in MCP server
- ✅ Y.Doc persistence with LevelDB
- ✅ Browser WebSocket client with y-indexeddb
- ✅ Bidirectional CRDT sync working
- ✅ Sync status indicator in UI

---

## Milestone 4: Plan Discovery & Multi-Peer ✅ COMPLETE

**Goal:** Multiple MCP instances (Claude Code, Cursor, VSCode) without conflicts

**Completed:**
- ✅ Registry server on ports 32191/32192 (in-memory)
- ✅ Per-instance LevelDB (`~/.peer-plan/plans/session-{pid}/`)
- ✅ Dynamic WebSocket port allocation (port 0)
- ✅ Browser multi-provider sync (connects to all MCP instances)
- ✅ Sidebar with plan list (Notion-like UI)
- ✅ Routing: `/`, `/plan/:id`, `/?d=` for snapshots
- ✅ New MCP tools: `list_plans`, `read_plan`, `update_plan`
- ✅ Plan index syncs via CRDT across all peers

**Architecture:**
```
Registry Server (32191/32192)
         ↑
    HTTP POST/DELETE
         ↑
Multiple MCP instances → WS:random, LevelDB per-instance
         ↓
Browser discovers all → Multi-provider Yjs merge
```

---

## Next Up

**Milestone 5 (Review Flow):** BlockNote comments, approval workflow, `get_feedback` tool

---

*Last updated: 2026-01-03*
