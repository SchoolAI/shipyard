# Design Documents

This directory contains detailed design research and specifications for major features.

---

## Active Designs

### Organizational Views (Issue #37)

Multi-view interface for managing AI agent work at scale.

- **[organizational-views-EXECUTIVE-SUMMARY.md](./organizational-views-EXECUTIVE-SUMMARY.md)** - Main reference document
  - Strategic context and industry validation
  - Five proposed views (Inbox, Kanban, Gallery, Table, Timeline)
  - Competitive differentiation and positioning
  - Schema changes and implementation roadmap
  - Research sources and methodology (70+ sources analyzed)
- **[ui-mockup-ascii.md](./ui-mockup-ascii.md)** - Visual mockups
  - ASCII art representations of all proposed views
  - Mobile responsive designs
  - Component interactions and layouts

**Status**: Research complete, implementation planned in [Milestone 10](../milestones/10-organizational-views.md)

---

### Context Teleportation

Research on session context transfer between Claude Code instances.

- **[context-teleportation-research.md](./context-teleportation-research.md)** - Investigation of context sharing patterns

**Status**: Research phase

---

### GitHub Login & Settings UI

Design for GitHub authentication and user settings interface.

- **[github-login-settings-ui.md](./github-login-settings-ui.md)** - UI specifications and implementation plan

**Status**: Completed (implemented in Milestone 9)

---

## How to Use These Docs

### For Implementation
1. Start with the EXECUTIVE-SUMMARY document to understand the "why"
2. Check the milestone doc (e.g., `../milestones/10-organizational-views.md`) for detailed phases and deliverables
3. Refer to mockups for visual reference during implementation
4. Create ADRs in `../decisions/` for any architectural changes

### For Research
- Design docs are living documents during research phase
- Once research is complete, consolidate into a single EXECUTIVE-SUMMARY
- Archive or delete redundant documents to maintain single source of truth
- Always link to the main reference doc from related milestones

---

## Document Patterns

### Design Doc Structure
A complete design document should include:
- **Problem statement** - What are we solving and why?
- **Strategic context** - Industry trends, competitive landscape
- **Proposed solution** - The "what" with clear priorities
- **Technical approach** - Schema changes, libraries, architecture
- **Implementation roadmap** - Phased plan with effort estimates
- **Success criteria** - How we measure success
- **Research sources** - References and methodology

### When to Create a Design Doc
Create a design doc when:
- Feature requires significant research (5+ sources)
- Multiple implementation approaches need evaluation
- Feature impacts architecture or schema
- Cross-cutting concerns across multiple milestones
- Non-trivial UX decisions need validation

Don't create design docs for:
- Simple feature additions (put in milestone doc directly)
- Bug fixes (create issue instead)
- Refactoring (create ADR if architectural)

---

*Last updated: 2026-01-12*
