# Peer-Plan Issues Inventory & Review

Full tracking table of all open issues, organized by priority. Use this to review, update priorities, and plan work.

## P1 - Critical Path (4 issues)

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| 44 | Enable plan content editing in web UI | enhancement | BlockNote writable editor - leverages Yjs |
| 46 | Code Mode for MCP - single endpoint | enhancement | Consolidate tools into one endpoint, 81% token reduction |
| 40 | Bidirectional PR linking & lifecycle | enhancement, integration | Full-circle workflow, PR status tracking |
| 17 | Claude Code integration - plan mode | enhancement, ux, integration | Primary user integration with hooks |

## P2 - Near-Term (10 issues)

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| 41 | Teleport conversation history | enhancement, integration | Agent handoffs, preserve context |
| 39 | Agent activity feed & status | enhancement, ux, integration | Human-agent collab visibility |
| 37 | Plan organization with tags | enhancement, ux | Sidebar grouping by category |
| 27 | Update README & getting started | documentation, enhancement | User-facing docs |
| 26 | OpenCode integration | enhancement, integration | Open-source agent support |
| 13 | Private repo artifacts via OAuth | enhancement, security | GitHub OAuth for private repos |
| 12 | Token-based P2P auth | enhancement, security, p2p | P2P security |
| 10 | Presence indicators ⚠️ | enhancement, P3(?), ux, p2p | **PRIORITY CONFLICT: P2 or P3?** |
| 9 | IDE/Editor adapters | enhancement, integration | VSCode, Obsidian plugins |

## P3 - Medium-Term (13 issues)

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| 47 | Plan-scoped agent presence | enhancement, ux, p2p | **NEW** - Know which agent on which plan |
| 38 | Agent naming conventions | enhancement, ux, p2p | Display names vs UUIDs |
| 36 | Plan relationships & nesting | enhancement | Hierarchical plans, versions |
| 35 | Multi-consumer editing & markdown | enhancement | External editor support (Obsidian) |
| 31 | Migrate Sonner → HeroUI Toast | enhancement, ui | Blocked on HeroUI v3 stable |
| 30 | Migrate to Bun runtime | enhancement | Performance optimization |
| 29 | Notion-style anchored comments | enhancement, ui, ux | Comment UX improvement |
| 28 | Delete plans (single & bulk) | enhancement, ux | Plan cleanup |
| 25 | Async review notifications | enhancement, ux, integration | Reviewer alerts |
| 22 | GitHub PR embeds with previews | enhancement, ux, integration | Rich link embeds |
| 19 | Cloud-hosted MCP relay | enhancement, integration, p2p | Cloudflare Workers relay |
| 18 | Agent-hosted deployment guide | documentation, enhancement, integration | Setup docs |
| 7 | Global comments (non-block) | enhancement, ux | General discussion |

## P4 - Future/Nice-to-Have (12 issues)

| # | Title | Labels | Notes |
|---|-------|--------|-------|
| 43 | Plan diff & comparison | enhancement | Compare versions visually |
| 42 | Plan version history | enhancement | Timeline, snapshots |
| 34 | Cloudflare CDN caching | enhancement, integration | Performance optimization |
| 33 | Set up Storybook | enhancement, ui | Component docs & testing |
| 32 | HeroUI v3 inventory | enhancement, ui | UI consistency pass |
| 23 | Search & filter plans | enhancement, ux | Plan discovery |
| 21 | Export/download options | enhancement, ux | Plan export formats |
| 20 | Rich link embeds (oEmbed) | enhancement, integration | Link embeds |
| 15 | Mobile app (iOS/Android) | enhancement, mobile | Long-term, major effort |
| 5 | WebSocket notifications | enhancement, ux | Real-time notifications |

## Summary Statistics

| Metric | Count |
|--------|-------|
| **P1** | 4 |
| **P2** | 10 |
| **P3** | 13 |
| **P4** | 12 |
| **Total Open** | 39 |
| **Closed (Duplicates)** | 2 (#2, #24) |

## Action Items

- [ ] Review P1 issues - are they ready to start?
- [ ] Resolve P2/P3 conflict on #10 (Presence indicators priority)
- [ ] Verify all priorities and labels are accurate
- [ ] Move any issues between priorities as needed
- [ ] Check for other duplicates or overlaps
- [ ] Plan sprint allocation for P1-P2 items

## Key Observations

**Strengths:**
- Clear priority distribution (P1-P4)
- Most issues well-documented with acceptance criteria
- Good mix of features, fixes, and infrastructure
- Many P1-P2 items are quick wins or high-impact

**Issues to Resolve:**
- #10 has conflicting P2/P3 labels - needs clarification
- #47 (plan-scoped presence) is new and might overlap with #10
- Review if P1 items are truly critical path

**Recommendations:**
- Start with P1 items immediately
- P2 items for next 1-2 months
- P3-P4 items are backlog/infrastructure
- Schedule priority review every 2 weeks

## Maintenance Notes

**Last Updated:** 2026-01-08

**Update Process:**
1. Pull latest issues from GitHub
2. Review priorities with team
3. Update this document
4. Commit changes to repository

**Sources:**
- GitHub Issues: https://github.com/SchoolAI/peer-plan/issues
- Priority labels: P1, P2, P3, P4
- Status: Open issues only (closed duplicates noted)
