# Organizational Views: Executive Summary

**Date**: January 12, 2026
**Research Scope**: 5 parallel Opus agents, 70+ sources, deep codebase analysis
**Question**: How should Peer-Plan evolve into an "all-in-one agent manager for software verification"?

---

## The Answer in One Sentence

**Build an approval-first interface with Kanban workflow visualization and artifact galleries that make AI agent work verifiable, trustworthy, and compliant.**

---

## Three Key Findings

### 1. The Industry Validated Our Thesis

**Google Antigravity (Nov 2025)** introduced "Artifacts" framework:
- Screenshots and browser recordings as proof-of-work
- Before/After comparisons
- Verifiable deliverables for compliance

**This is exactly what Peer-Plan already does.** We're not following a trend - we're ahead of it.

### 2. Verification is the 2026 Bottleneck

**Market growth:**
- 40% of enterprise apps will embed AI agents by end of 2026 (Gartner)
- 86% of businesses will deploy AI agents by 2027 (Deloitte)

**The problem:**
- AI code has **higher defect rate** than human code
- 70% of developers **rewrite AI output** before production
- 82% of consumers **don't trust AI** without human review

**The gap:** Everyone is building agents. Nobody is building verification infrastructure.

### 3. Multi-View Organization is Table Stakes

**What users expect** (from Notion, Linear, Asana research):
- Instant view switching on same data
- Search + Sort + Filter in all views
- Saved preferences that persist

**What Peer-Plan currently lacks:**
- No search
- No sort options
- No filters within sections
- Locked into list view

---

## The Five Views (Priority Order)

| # | View | Purpose | Effort | Impact |
|---|------|---------|--------|--------|
| 1 | **Approval Queue** | "What needs my attention NOW" | 1-2 days | High |
| 2 | **Kanban Board** | Status workflow visualization | 3-5 days | High |
| 3 | **Artifact Gallery** | Visual proof-of-work | 5-7 days | **Unique differentiator** |
| 4 | **Table View** | Power user bulk operations | 3-5 days | Medium |
| 5 | **Timeline** | Retrospectives & audit trails | 5-7 days | Low (nice-to-have) |

**Total implementation:** ~4-5 weeks for views 1-4

---

## What Makes Peer-Plan Unique

### Competitive Matrix

|  | Peer-Plan | Cursor 2.0 | Antigravity | Devin | Linear |
|---|:---------:|:----------:|:-----------:|:-----:|:------:|
| **P2P Collaboration** | ✅ Unique | ❌ | ❌ | ❌ | ❌ |
| **Artifact Proof** | ✅ | ❌ | ✅ | Limited | ❌ |
| **MCP Integration** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Open Source** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Multi-View Org** | 🔄 Building | ❌ | ✅ | ❌ | ✅ |

### Our Differentiation

**Not an IDE** → Works with any agent (Claude Code, Cursor, Devin)
**Not a code review tool** → Verifies artifacts, not just diffs
**Not a PM tool** → Optimized for agent verification, not human task tracking
**Not observability** → Focused on approval workflows, not just monitoring

**We are:** The trust infrastructure between AI agents and human reviewers.

---

## Schema Changes Needed

### Phase 1: No Changes Required

Views 1-2 (Queue + Kanban) work with current schema.

### Phase 2: Tags & Organization (#37)

```typescript
interface PlanMetadata {
  // ... existing ...
  tags?: string[];
  project?: string;
  category?: 'backend' | 'frontend' | 'infrastructure' | 'devops' | 'docs' | 'other';
}
```

### Phase 3: Relationships (#36)

```typescript
interface PlanMetadata {
  // ... existing ...
  parentPlanId?: string;
  previousPlanId?: string;
  relationshipType?: 'child' | 'version' | 'follow_up';
}
```

### Optional: Dates for Timeline

```typescript
interface PlanMetadata {
  // ... existing ...
  dueDate?: number;
  startDate?: number;
}
```

---

## Implementation Roadmap

### Week 1: Make Sidebar Better
- Add search input
- Add sort dropdown
- Add status filters
- Persist preferences

**Result:** Immediate usability win, zero risk

### Week 2: Kanban Board
- Install @dnd-kit
- Build KanbanView component
- Add view switcher
- Wire up drag-drop to update status

**Result:** Industry-standard workflow visualization

### Week 3: Tags & Filtering
- Update schema (tags, project, category)
- Build tag editor UI
- Update MCP tools
- Add tag filters to all views

**Result:** Flexible organization for scale

### Week 4: Artifact Gallery
- Install Masonic
- Build GalleryView component
- Add before/after comparison mode
- Add artifact type filters

**Result:** Unique differentiator, visual trust

### Week 5: Table View (Optional)
- Install TanStack Table
- Build TableView component
- Add column configuration
- Add bulk actions

**Result:** Power user operations

---

## Critical Success Factors

### 1. Artifacts Must Be First-Class

Don't bury artifacts in tabs. Make them prominent:
- Thumbnail previews in every view
- One-click comparison mode
- Verification status badges
- Missing artifact warnings

### 2. Approval Workflow Must Be Frictionless

Current: Click plan → scroll → find button → click approve → confirm
**Target:** <30 seconds from notification to approval

### 3. Mobile Must Work for Quick Reviews

Reviewers will approve from phones. Inbox view must be mobile-optimized.

### 4. Search Must Be Instant

<50ms response time, incremental search, fuzzy matching

### 5. Preserve P2P Architecture

Views must work offline, sync via CRDT, no central server dependency

---

## Risk Mitigation

### Risk 1: Over-Engineering

**Mitigation:** Ship Phase 1 (sidebar improvements) in days, not weeks. Get feedback before building Kanban.

### Risk 2: Performance at Scale

**Mitigation:** Virtualize all views from day one. Test with 100+ plans.

### Risk 3: Mobile Complexity

**Mitigation:** Start desktop-first. Add mobile responsiveness after core views work.

### Risk 4: User Confusion (Too Many Views)

**Mitigation:** Smart defaults. Show Inbox to reviewers, Kanban to plan owners.

---

## Recommended Next Steps

### Option A: Ship Fast (Recommended)

1. **This week:** Enhance sidebar with search/sort/filter
2. **Next week:** User test, gather feedback
3. **Week after:** Start Kanban based on learnings

**Pros:** Fast validation, low risk, iterative
**Cons:** Slower progress on "wow" features

### Option B: Go Bold

1. **Week 1-2:** Build all 5 views in parallel
2. **Week 3:** Polish and testing
3. **Week 4:** Ship complete multi-view system

**Pros:** Big feature launch, competitive leap
**Cons:** Higher risk, less user feedback early

**Recommendation:** Option A. Engineering standards say "fight complexity" and "avoid over-engineering."

---

## Key Metrics to Track

### UX Metrics
- Time to find a plan: **<5 sec** (currently: scroll through list)
- Time to approve plan: **<30 sec** (currently: ~1 min)
- View switch frequency: **>2 per session** (validate multi-view value)

### Product Metrics
- Plans created per week: **Growing**
- Approval rate: **>70%** (indicates agent quality)
- Artifact upload rate: **>80%** plans (verification adoption)
- Multi-reviewer plans: **>30%** (collaboration value)

---

## Competitive Positioning

### Tagline Options

1. "The trust layer for AI agents"
2. "Verify what your agents build"
3. "Collaborative review for AI-generated code"
4. "Proof-of-work for autonomous agents"

### Target Market Segmentation

| Segment | Pain Point | Peer-Plan Solution |
|---------|------------|-------------------|
| **Solo Devs** | "Did my agent actually fix the bug?" | Artifact proof with screenshots |
| **Teams** | "How do we review agent PRs?" | P2P collaborative review |
| **Enterprises** | "How do we audit AI decisions?" | SOC 2-ready audit trails |

---

## Sources & Research Methodology

This document synthesizes research from **5 parallel Opus agents** analyzing **70+ sources** across:

### Project Management & UX Patterns
- **Notion** - Multi-view database patterns, inline editing, real-time collaboration
- **Linear** - Conceptual model, issue tracking workflows, keyboard-first UX
- **Asana** - Project views (List, Board, Timeline, Calendar, Portfolio)
- **ClickUp** - Multiple views, custom fields, automation
- **Monday.com** - Work OS patterns, board customization
- **Jira** - Agile workflows, issue hierarchies, JQL

### AI Agent Tools & Platforms
- **Cursor 2.0** (Oct 2025) - Agent sidebar, 8 parallel agents, per-agent undo
  - Source: [Cursor Changelog](https://cursor.com/changelog/2-0)
- **Google Antigravity** (Nov 2025) - Artifacts framework (screenshots, recordings, before/after)
  - Source: [Google Blog](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
- **Roo Code** - Multi-mode agents (Architect/Code/Debug/Ask)
  - Source: [Roo Code vs Cline](https://www.qodo.ai/blog/roo-code-vs-cline/)
- **CrewAI** - Role-based agent orchestration with dashboards
- **Devin** - Autonomous software engineering agent
- **AgentOps/LangSmith** - LLM observability patterns

### Human-in-the-Loop (HITL) & Verification
- **Microsoft Agent UX Framework** - Design principles for agent interfaces
  - Source: [Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)
- **Permit.io HITL Guide** - Approval flows, escalation paths
  - Source: [HITL Best Practices](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- **UiPath** - Attended vs unattended automation patterns
- **Zapier** - Human approval nodes in workflows

### Software Verification & Compliance
- **SOC 2 Requirements** - Audit trail requirements for AI systems
- **EU AI Act** - Human oversight mandates for high-risk AI
- **US Copyright Law** (March 2025) - Human authorship requirement
- **Google/PWC Research** - AI code quality statistics
- **Virtuoso QA** - Software testing and verification trends

### React Ecosystem Libraries
- **@dnd-kit** - Accessible drag-and-drop (10KB, modern)
- **TanStack Table** - Headless table library (15KB)
- **Masonic** - Virtualized masonry layout (8KB)
- **react-compare-image** - Before/after image slider
- **@tanstack/react-virtual** - List/grid virtualization

### Industry Trends & Statistics
- **Gartner**: 40% of enterprise apps will embed AI agents by end of 2026
- **Deloitte**: 86% of businesses will deploy AI agents by 2027
- **PWC**: AI-generated code has significantly higher defect rate than human code
- **Developer surveys**: 70% rewrite AI code before production, 82% consumers don't trust AI without oversight
- **Legislative tracking**: 700+ AI bills introduced in US (2024)

### Research Process
1. **Competitive analysis** - Analyzed UI patterns from 15+ tools
2. **Codebase review** - Deep dive into current Peer-Plan architecture
3. **Library evaluation** - Compared 20+ React libraries for drag-drop, tables, masonry
4. **Trend synthesis** - Connected industry movement toward artifacts-as-proof
5. **Risk assessment** - Identified technical and UX risks with mitigations

---

## Visual Mockups

For detailed ASCII mockups of all proposed views, see:
- **[ui-mockup-ascii.md](./ui-mockup-ascii.md)** - Visual representations of Inbox, Kanban, Gallery, Table, and Timeline views

---

## Final Recommendation

**Start with Approval Queue (View 1).** It's:
- ✅ Highest impact (reduces review friction)
- ✅ Lowest effort (1-2 days)
- ✅ Matches core use case (human reviews agent work)
- ✅ Validates multi-view architecture
- ✅ No schema changes required

Then iterate based on user feedback. If users love it → add Kanban. If they want more filtering → add tags first.

**Don't build all 5 views at once.** Ship Phase 1, learn, adapt.

---

## Implementation Reference

For detailed implementation plan with phases, deliverables, and technical specs, see:
- **[../milestones/10-organizational-views.md](../milestones/10-organizational-views.md)** - Complete milestone plan

---

*Research completed: January 12, 2026*
