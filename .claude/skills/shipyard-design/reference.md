# Design -- Full Reference

## Layout Patterns

### Page Layouts

**Single column (chat, feed, article):**
```
flex flex-col h-screen
  ├── TopBar (shrink-0)
  ├── Content (flex-1 overflow-y-auto)
  └── Footer/Composer (shrink-0)
```

**Sidebar + Main:**
```
flex h-screen
  ├── Main (flex flex-col flex-1 min-w-0)
  │   ├── TopBar
  │   ├── Content (flex-1 overflow-y-auto)
  │   └── Bottom panel (shrink-0, toggleable)
  └── Sidebar (shrink-0, toggleable width)
      └── Content (min-w-[400px])
```

**Split panel (editor + preview):**
```
flex h-screen
  ├── Left (flex-1 min-w-0)
  └── Right (flex-1 min-w-0)
  (+ draggable resize handle between)
```

### Responsive Collapse

Sidebars and split panels collapse on mobile:

```tsx
// Desktop: side-by-side. Mobile: full-width overlay.
<div className={`shrink-0 transition-[width] duration-300 ${
  isOpen ? 'w-[40vw] min-w-[400px] max-sm:w-full' : 'w-0'
}`}>
```

### Content Width Constraints

- Chat messages: `max-w-3xl mx-auto` (readability)
- Forms: `max-w-md` or `max-w-lg`
- Full-width: dashboards, tables, editors
- Always add `px-3 sm:px-4` horizontal padding

### Grid Patterns

```tsx
// Suggestion cards: 1 col mobile, 3 col desktop
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

// Dashboard metrics: 2 col mobile, 4 col desktop
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

// Settings: single column, constrained
<div className="flex flex-col gap-6 max-w-lg mx-auto">
```

---

## Typography

### Scale

Use Tailwind's default type scale. The hierarchy:

| Role | Class | Size | Use |
|------|-------|------|-----|
| Page title | `text-xl sm:text-2xl font-semibold` | 20-24px | One per page |
| Section heading | `text-lg font-semibold` | 18px | Major sections |
| Subsection | `text-base font-medium` | 16px | Groups within sections |
| Body | `text-sm` | 14px | Default for all UI text |
| Caption | `text-xs` | 12px | Labels, timestamps, metadata |
| Tiny | `text-[11px]` | 11px | Badges, micro-labels (rare) |

### Rules

- **Body text is `text-sm` (14px)**, not `text-base`. This is a developer tool -- information density matters.
- **One `text-xl`+ per page** for the primary heading. Multiple large headings compete.
- **font-semibold for headings**, font-medium for labels, font-normal for body.
- **Line height**: Tailwind defaults (leading-normal ~1.5). Use `leading-relaxed` for long-form text, `leading-tight` for headings.
- **Truncation**: Use `truncate` (single line) or `line-clamp-N` (multi-line) for user content that might overflow.

---

## Color System

### Semantic Tokens

| Token | Tailwind class | Purpose |
|-------|---------------|---------|
| background | `bg-background` | Page root |
| foreground | `text-foreground` | Primary text |
| surface | `bg-surface` | Cards, panels, elevated containers |
| overlay | `bg-overlay` | Modals, popovers, drawers |
| default | `bg-default` | Buttons, chips, subtle controls |
| muted | `text-muted` | Secondary text, placeholders |
| accent | `bg-accent`, `text-accent` | Primary actions, focus rings, emphasis |
| secondary | `text-secondary` | Links, info indicators |
| separator | `border-separator` | Dividers between sections |
| success/warning/danger | `text-success`, etc. | Status indicators |

### Color Application Rules

1. **Never hardcode colors** -- use semantic tokens exclusively
2. **Backgrounds layer upward**: background < surface < overlay < default
3. **Text contrast**: `text-foreground` on dark backgrounds, `-foreground` variant on colored backgrounds
4. **Reduced emphasis**: Use `text-foreground/80` or `text-muted` instead of separate gray tokens
5. **Status colors only for status** -- don't use `danger` for visual emphasis

### WCAG Contrast Requirements

| Pair | Minimum ratio | Level |
|------|--------------|-------|
| `foreground` on `background` | 4.5:1 | AA (normal text) |
| `muted` on `background` | 3:1 | AA (large text / UI) |
| `accent` on `background` | 3:1 | AA (UI components) |
| `accent-foreground` on `accent` | 4.5:1 | AA (button text) |

When adding new colors, verify contrast at https://oklch.com or similar tool.

---

## Accessibility Checklist

### Keyboard Navigation

- [ ] All interactive elements reachable via Tab
- [ ] Tab order follows visual reading order
- [ ] Focus is visible on every focusable element (HeroUI provides this)
- [ ] Escape closes modals/popovers/dropdowns
- [ ] Enter/Space activates buttons and controls
- [ ] Arrow keys navigate within groups (tabs, menus, radio groups)
- [ ] No keyboard traps (can always Tab out)

### Screen Readers

- [ ] Every icon-only button has `aria-label`
- [ ] Form inputs associated with `<Label>` (HeroUI handles this)
- [ ] Heading hierarchy is logical (h1 > h2 > h3, no skips)
- [ ] Dynamic content changes announced via `aria-live` regions
- [ ] Decorative images have `aria-hidden="true"` or empty `alt=""`

### Visual

- [ ] Color is never the sole indicator (add icons/text)
- [ ] Text contrast meets WCAG AA (4.5:1 normal, 3:1 large)
- [ ] Focus indicators visible against all backgrounds
- [ ] Touch targets minimum 44x44px
- [ ] Text is resizable up to 200% without loss of content

### Motion

- [ ] Animations respect `prefers-reduced-motion`
- [ ] No content flashes more than 3 times per second
- [ ] Auto-playing animations have pause control

---

## Animation Guidelines

### When to Animate

| Animate | Don't animate |
|---------|--------------|
| Panel open/close (spatial orientation) | Loading spinners appearing (jarring) |
| Content transitions (context change) | First paint (delays perceived load) |
| Hover/focus states (feedback) | Scroll position changes (disorienting) |
| Dropdown/popover reveal (spatial) | Background color on theme change |

### Timing

| Duration | Use for |
|----------|---------|
| 150ms | Hover states, focus rings, micro-interactions |
| 200ms | Tooltips, small reveals |
| 300ms | Panel slides, accordion, modal entry |
| 500ms | Page transitions (rare in SPA) |

### Easing

- **ease-in-out**: Default for most transitions (`transition-all duration-300 ease-in-out`)
- **ease-out**: Elements entering view (faster start, gentle stop)
- **ease-in**: Elements leaving view (gentle start, faster exit)
- **linear**: Progress bars, continuous animations only

### Reduced Motion

```tsx
// CSS approach (preferred)
className="transition-transform duration-300 motion-reduce:transition-none"

// Or use motion-safe for opt-in animation
className="motion-safe:transition-all motion-safe:duration-300"
```

---

## Responsive Design Patterns

### Mobile-First Approach

Write the mobile layout first, then add `sm:` / `md:` / `lg:` overrides:

```tsx
// Mobile: stacked, compact. Desktop: side-by-side, spacious.
<div className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:gap-4 sm:px-4 sm:py-6">
```

### Common Responsive Adjustments

| What changes | Mobile | Desktop |
|-------------|--------|---------|
| Layout | Single column | Multi-column |
| Sidebars | Hidden or overlay | Persistent side panel |
| Padding | `px-3 py-3` | `px-4 py-4` or `px-6 py-6` |
| Font sizes | Same or `text-xl` | `sm:text-2xl` for heroes only |
| Grid | `grid-cols-1` | `sm:grid-cols-2` or `sm:grid-cols-3` |
| Drawers | Full-width bottom sheet | Side panel with fixed width |
| Touch targets | 44px+ always | Can be 32px for dense UI |

### Overflow Handling

- Horizontal: `overflow-x-auto` for tables/code blocks, `truncate` for text
- Vertical: `overflow-y-auto` for scrollable regions, `max-h-[60vh]` for bounded lists
- Text: `line-clamp-2` or `line-clamp-3` for preview cards

---

## Component Composition Decisions

### When to Use HeroUI vs Custom

| Use HeroUI when... | Build custom when... |
|--------------------|---------------------|
| Standard UI pattern (button, input, modal) | Novel interaction not in HeroUI's 56 components |
| Need built-in accessibility (ARIA, keyboard) | Pure layout container (no interaction) |
| Want consistent styling across app | Highly specialized visualization |
| Pattern exists in HeroUI component list | Wrapping a third-party library (e.g., xterm.js) |

### When to Extract a Component

Extract when you see the same layout pattern in **3+ places** (matches the 3+ Rule from engineering-standards):
- Same arrangement of elements
- Same responsive behavior
- Same spacing/sizing

Below 3 uses, inline the JSX. Premature extraction creates abstraction without value.

### Composition Over Customization

Prefer composing HeroUI components together over heavily customizing a single one:

```tsx
// Good: compose simple components
<Card>
  <Card.Header>
    <div className="flex items-center gap-2">
      <Avatar size="sm" />
      <Card.Title>Name</Card.Title>
    </div>
  </Card.Header>
  <Card.Content>...</Card.Content>
</Card>

// Avoid: over-customizing with className overrides
<Card className="p-0 gap-0 [&>header]:flex-row [&>header]:gap-2 ...">
```
