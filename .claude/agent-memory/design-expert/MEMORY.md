# Design Expert Memory

## Sidebar Design Decisions (2026-02-13)

Redesigned sidebar to match Codex-style clean aesthetic. Key principles applied:
- **Ghost-row "New task" button** -- not a loud accent CTA. Sidebar is navigation, not marketing.
- **Single-line task items** -- title + timestamp only. Agent metadata surfaces on task selection, not in the scan view.
- **Status dots: w-1.5 h-1.5** with `aria-hidden="true"` and state info in `aria-label` on the button.
- **Section labels: sentence case, `text-muted/60`** -- not uppercase/tracking-wider.
- **No border on settings divider** -- `mt-auto` whitespace is the separator.
- **Subdued active/hover**: `bg-default/60` active, `bg-default/30` hover. Text color shift (`text-muted` to `text-foreground`) is the primary differentiator.
- **Logo demoted**: smaller, 60% opacity, no wordmark text.

## Key Files
- Sidebar: `apps/web/src/components/sidebar.tsx`
- Theme tokens: `apps/web/src/app.css`
- Design patterns: `.claude/skills/design/patterns.md`
