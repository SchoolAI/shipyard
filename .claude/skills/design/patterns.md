# Design -- Shipyard Patterns

Conventions extracted from the existing Shipyard codebase and design decisions.

## The Shipyard Visual Language

### Dark-First

Shipyard is dark mode only (for now). All design decisions optimize for dark backgrounds:
- Depth via subtle lightness steps (background < surface < overlay), not shadows
- Borders are near-invisible (`--border: oklch(1 0 0 / 0%)`) -- use `border-separator` when visible dividers are needed
- Shadows disabled (`--surface-shadow: 0 0 0 0 transparent inset`)
- Contrast comes from text color hierarchy, not background variation

### Nautical Palette

The color system is derived from the Shipyard logo:

| Element | Color family | Token | oklch |
|---------|-------------|-------|-------|
| Ship hull | Deep navy | `background` | `oklch(0.145 0.02 250)` |
| Hull deck | Slightly lighter navy | `surface` | `oklch(0.20 0.02 250)` |
| Ship tower | Steel blue | `muted` | `oklch(0.60 0.03 240)` |
| Cargo containers | Rust/copper | `accent` | `oklch(0.65 0.16 45)` |
| Ocean waves | Teal/cyan | `secondary` | `oklch(0.72 0.14 200)` |

### Token Usage Rules

**Backgrounds** (lightest to darkest):
- `bg-background` -- page root only
- `bg-surface` -- cards, panels, elevated containers
- `bg-overlay` -- modals, popovers
- `bg-default` -- interactive controls (buttons, chips)
- `bg-field-background` -- form inputs

**Text**:
- `text-foreground` -- primary text
- `text-foreground/80` -- slightly reduced emphasis
- `text-muted` -- secondary text, labels, timestamps
- `text-muted/60` -- tertiary text, hints
- `text-accent` -- emphasis, active state
- `text-secondary` -- links, info

**Borders**:
- `border-separator` -- visible dividers (panels, sections)
- `border-separator/50` -- subtle dividers (within sections)
- `border-accent` -- active/selected indicator

---

## Layout Case Studies

### Chat Page Layout (chat-page.tsx)

Three-region layout with toggleable panels:

```
┌─────────────────────────────────────────────┐
│ TopBar (shrink-0)                            │
├─────────────────────────────────┬────────────┤
│ Chat messages (flex-1, scroll)  │ Diff panel │
│                                 │ (40vw,     │
│                                 │ toggleable)│
│                                 │            │
├─────────────────────────────────┤            │
│ Composer (shrink-0)             │            │
├─────────────────────────────────┤            │
│ Terminal panel (shrink-0, toggle)│           │
└─────────────────────────────────┴────────────┘
```

Key patterns:
- Main area uses `flex flex-col flex-1 min-w-0 overflow-hidden`
- Side panel uses `shrink-0 transition-[width] duration-300` for smooth open/close
- Mobile: side panel goes `max-sm:w-full` (full overlay instead of split)
- Content area scrolls independently: `flex-1 overflow-y-auto`

### Composer (chat-composer.tsx)

Dense toolbar with multiple control groups:

```
┌────────────────────────────────────────────┐
│ textarea (auto-height)                      │
├────────────────────────────────────────────┤
│ [icons...] [spacer] [model] [toggles] [send]│
└────────────────────────────────────────────┘
```

Key patterns:
- Outer: `bg-surface rounded-2xl border border-separator shadow-lg`
- Toolbar: `flex items-center justify-between px-3 py-2`
- Icon groups: `flex items-center gap-0.5` (tight spacing within groups)
- Dividers between groups: `<div className="w-px h-4 bg-separator/30 mx-1" />`
- Icon buttons: `w-8 h-8 min-w-0` with `isIconOnly variant="ghost" size="sm"`

### Hero State (empty state)

Centered content with suggestion cards:

```
flex flex-col items-center justify-center flex-1
  ├── Logo + title (centered, gap-4, mb-12 sm:mb-16)
  └── Card grid (grid-cols-1 sm:grid-cols-3 gap-3)
```

Key pattern: `max-w-3xl mx-auto` constrains content width for readability.

---

## Common Anti-Patterns

### Hardcoded Colors

```tsx
// BAD
<div className="bg-zinc-900 text-zinc-100 border-zinc-700">

// GOOD
<div className="bg-surface text-foreground border-separator">
```

### Missing Accessibility

```tsx
// BAD -- icon button with no label
<Button isIconOnly size="sm"><X /></Button>

// GOOD
<Button isIconOnly size="sm" aria-label="Close panel"><X /></Button>
```

### Inconsistent Spacing

```tsx
// BAD -- mixing spacing scales
<div className="gap-3 p-5 mt-7">  {/* 12px, 20px, 28px -- not on 4px grid */}

// GOOD -- consistent 4px multiples
<div className="gap-3 p-4 mt-6">  {/* 12px, 16px, 24px */}
```

### Over-Nesting for Layout

```tsx
// BAD -- unnecessary wrapper divs
<div className="flex">
  <div className="flex-1">
    <div className="flex flex-col">
      <Content />
    </div>
  </div>
</div>

// GOOD -- flatten
<div className="flex flex-col flex-1">
  <Content />
</div>
```

### Forgetting Responsive

```tsx
// BAD -- fixed width, breaks on mobile
<div className="w-[600px] p-8">

// GOOD -- responsive with constraints
<div className="w-full max-w-[600px] p-4 sm:p-8">
```

---

## Design Review Checklist

When reviewing UI changes, verify:

### Layout
- [ ] Follows established page layout patterns
- [ ] Content has appropriate max-width constraint
- [ ] Horizontal padding present (`px-3` min on mobile)
- [ ] Overflow handled (scroll, truncate, or line-clamp)

### Responsive
- [ ] Works at 320px width (smallest phone)
- [ ] Breakpoint transitions are smooth (no jarring reflows)
- [ ] Touch targets 44px+ on mobile
- [ ] Sidebars/panels collapse or overlay on mobile

### Color & Tokens
- [ ] Zero hardcoded color values in className
- [ ] Semantic tokens used (bg-surface, not bg-[oklch(...)])
- [ ] Text contrast sufficient against background
- [ ] Status colors used only for status (success/warning/danger)

### Accessibility
- [ ] All icon buttons have aria-label
- [ ] Interactive elements keyboard-reachable
- [ ] Focus order matches visual order
- [ ] Color not the only status indicator

### Spacing & Alignment
- [ ] Spacing uses 4px multiples
- [ ] Related items visually grouped
- [ ] Alignment consistent within sections
- [ ] No unnecessary wrapper divs

### Animation
- [ ] Transitions use 150-300ms range
- [ ] Ease-in-out for most, ease-out for entry
- [ ] motion-reduce considered for significant animations
