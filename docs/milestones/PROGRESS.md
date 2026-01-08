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
- ✅ New MCP tools: `read_plan`, `update_plan`
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

## Milestone 5: Review Flow ✅ COMPLETE

**Goal:** Full annotation and review workflow

**Completed:**
- ✅ BlockNote comments integration (YjsThreadStore, CommentsExtension)
- ✅ CommentsPanel sidebar with real-time thread sync
- ✅ User identity system (ProfileSetup modal, localStorage)
- ✅ Review status UI (Approve/Request Changes with confirmation)
- ✅ Agent feedback via `read_plan` tool with `includeAnnotations: true`
- ✅ Thread parsing and export to structured markdown
- ✅ FormattingToolbar with AddCommentButton

**Key files:**
- `apps/web/src/components/CommentsPanel.tsx` - Thread list sidebar
- `apps/web/src/components/ReviewActions.tsx` - Approve/Request Changes
- `apps/web/src/utils/identity.ts` - User identity helpers
- `apps/server/src/tools/read-plan.ts` - MCP tool includes annotations
- `packages/schema/src/thread.ts` - Thread parsing utilities

---

## Milestone 6: P2P ✅ COMPLETE

**Goal:** WebRTC remote collaboration - multiple reviewers sync without central server

**Completed:**
- ✅ y-webrtc provider added to browser
- ✅ Signaling server configurable via `VITE_WEBRTC_SIGNALING` env var
- ✅ Peer count shown in sidebar ("X P2P" indicator)
- ✅ Share button to copy URL for P2P collaboration
- ✅ Full offline P2P - works even without MCP server

**Key files:**
- `apps/web/src/hooks/useMultiProviderSync.ts` - WebRTC provider integration
- `apps/web/src/components/ShareButton.tsx` - Copy URL to clipboard
- `apps/web/src/components/Sidebar.tsx` - P2P peer count display

**Future enhancement:** [Token-based room auth](https://github.com/SchoolAI/peer-plan/issues/12)

---

## Milestone 7: Artifacts ✅ COMPLETE

**Goal:** GitHub blob storage for screenshots, videos, test results

**Completed:**
- ✅ GitHub storage functions (orphan branch creation, artifact upload)
- ✅ `add_artifact` MCP tool with base64 content support
- ✅ Artifact type detection and rendering (images, videos, JSON, diffs)
- ✅ Attachments section in UI with real-time CRDT sync
- ✅ Schema validation with Zod (`ArtifactSchema`)
- ✅ YDOC_KEYS.ARTIFACTS added to schema package

**Key files:**
- `apps/server/src/github-artifacts.ts` - GitHub API integration
- `apps/server/src/tools/add-artifact.ts` - MCP tool
- `apps/web/src/components/ArtifactRenderer.tsx` - Type-specific rendering
- `apps/web/src/components/Attachments.tsx` - Artifacts display section
- `packages/schema/src/yjs-helpers.ts` - CRDT artifact helpers
- `packages/schema/src/yjs-keys.ts` - ARTIFACTS key definition

**Tech stack:**
- @octokit/rest for GitHub API
- Orphan branch: `plan-artifacts`
- Authentication: GitHub PAT via `GITHUB_TOKEN` env var

**Future enhancement:** [OAuth for private repos](https://github.com/SchoolAI/peer-plan/issues/13)

---

## Milestone 8: Waiting Room & Access Control (IN PROGRESS)

**Goal:** Zoom-like approval flow for shared plans

**Completed:**
- ✅ Schema updates: `ownerId`, `approvalRequired`, `approvedUsers` in PlanMetadata
- ✅ Awareness protocol extension for pending/approved status
- ✅ Waiting Room UI component (blocks content until approved)
- ⏳ Owner Approval Panel (approve/deny pending users) - Blocked on M9
- ⏳ Signaling server enforcement - Deferred
- ✅ MCP integration: `create_plan` sets `ownerId`

**Blocked by:** Milestone 9 (GitHub Identity) - needed for verified ownership

**Key architecture:**
- Signaling server is the gatekeeper (server-side enforcement)
- Yjs awareness for instant presence/status updates
- CRDT metadata stores persistent approval list

See [08-waiting-room.md](./08-waiting-room.md) for full details.

---

## Milestone 9: GitHub Identity ✅ COMPLETE

**Goal:** Replace random IDs with verified GitHub usernames for ownership

**Completed:**
- ✅ Server uses `gh api user` for GitHub username as `ownerId`
- ✅ Browser GitHub OAuth Web Flow authentication
- ✅ Cloudflare Worker for token exchange (no backend needed)
- ✅ Account UI in sidebar (avatar, dropdown, sign in/out)
- ✅ Account picker prompt for switching accounts
- ✅ Approval logic uses GitHub username

**Key files:**
- `apps/server/src/server-identity.ts` - GitHub username from gh CLI
- `apps/web/src/hooks/useGitHubAuth.ts` - OAuth Web Flow hook
- `apps/web/src/components/account/` - Account UI components
- `apps/github-oauth-worker/` - Cloudflare Worker for token exchange

**OAuth App:** `Ov23liNnbDyIs6wu4Btd`

---

## Summary

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Foundation | ✅ Complete |
| 1 | Agent Creates Plans | ✅ Complete |
| 2 | View Plans | ✅ Complete |
| 3 | Live Sync | ✅ Complete |
| 4 | Plan Discovery | ✅ Complete |
| 5 | Review Flow | ✅ Complete |
| 6 | P2P | ✅ Complete |
| 7 | Artifacts | ✅ Complete |
| 8 | Waiting Room | 🔄 In Progress |
| 9 | GitHub Identity | ✅ Complete |

---

*Last updated: 2026-01-08*
