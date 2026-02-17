---
name: shipyard-design
description: "Universal UI/UX design principles and Shipyard design system. Use when making layout decisions, reviewing visual design, improving accessibility, choosing component composition, designing responsive layouts, or working with typography, spacing, color, and animation. Covers WCAG accessibility, visual hierarchy, mobile-first responsive, and design review."
---

# Design Principles

A **domain skill** providing universal design knowledge and Shipyard's design system conventions. This skill informs *what* to build and *where* things go -- not *how* to call a component API (that's heroui-expert).

## The Design Hierarchy

Every design decision flows from this priority:

1. **Accessibility** -- Can everyone use it? (keyboard, screen reader, low vision, motor)
2. **Clarity** -- Is the purpose obvious in < 1 second?
3. **Consistency** -- Does it match existing patterns?
4. **Aesthetics** -- Does it look and feel right?

Never sacrifice a higher priority for a lower one.

## Quick Reference: Visual Hierarchy

Establish importance through these levers (in order of impact):

| Lever | High emphasis | Low emphasis |
|-------|--------------|--------------|
| **Size** | Larger (text-2xl) | Smaller (text-xs) |
| **Weight** | Bold (font-semibold) | Normal (font-normal) |
| **Color** | text-foreground | text-muted |
| **Contrast** | Full opacity | Reduced (text-foreground/80) |
| **Position** | Top-left (F-pattern) | Bottom-right |
| **Whitespace** | More surrounding space | Less space |

## Quick Reference: Layout Principles

- **F-pattern**: Users scan left-to-right, then down-left. Place primary actions top-left.
- **Proximity**: Related items close together, unrelated items separated by whitespace.
- **Alignment**: Every element should align with at least one other element.
- **Containment**: Use borders/backgrounds sparingly -- whitespace groups better than boxes.

## Quick Reference: Spacing Scale

Use Tailwind's 4px base scale consistently:

| Token | px | Use for |
|-------|-----|---------|
| gap-1 / p-1 | 4px | Tight: icon-to-text, chip padding |
| gap-2 / p-2 | 8px | Compact: toolbar items, button padding |
| gap-3 / p-3 | 12px | Default: card padding, list items |
| gap-4 / p-4 | 16px | Comfortable: section spacing, form fields |
| gap-6 / p-6 | 24px | Spacious: section breaks, card bodies |
| gap-8 / p-8 | 32px | Large: page section gaps |
| gap-12+ | 48px+ | Hero: major landmark spacing |

**Rule**: Stick to multiples of 4. Mixing 4px and 5px creates visual noise.

## Quick Reference: Responsive Strategy

Mobile-first: start with the smallest screen, add complexity at breakpoints.

| Breakpoint | Width | Typical change |
|------------|-------|----------------|
| (default) | 0-639px | Single column, stacked, full-width |
| `sm:` | 640px+ | Side-by-side, multi-column grids |
| `md:` | 768px+ | Wider panels, more horizontal space |
| `lg:` | 1024px+ | Sidebar layouts, three-column |
| `xl:` | 1280px+ | Max-width containers, comfortable margins |

**Touch targets**: Minimum 44x44px (WCAG 2.5.8). Icon buttons need `min-w-[44px] min-h-[44px]` or equivalent.

## Quick Reference: Accessibility Essentials

- Every interactive element reachable by keyboard (Tab/Shift+Tab)
- Every image/icon button has `aria-label` or visible text
- Color is never the only indicator (add icons/text for status)
- Focus indicators visible on all interactive elements
- Contrast ratio: 4.5:1 minimum for text, 3:1 for large text/UI components
- Heading hierarchy: h1 > h2 > h3, never skip levels
- `prefers-reduced-motion`: respect user preference, provide `motion-safe:` variants

## Shipyard Design System

### Color Palette

Derived from the Shipyard logo:
- **Navy hull** -> backgrounds (background, surface, overlay)
- **Rust/copper containers** -> accent (actions, focus, emphasis)
- **Teal/cyan waves** -> secondary (links, info)
- **Steel blue tower** -> muted (secondary text)

**Rule**: Always use semantic tokens (`bg-background`, `text-foreground`, `border-separator`). Never hardcode oklch/hex values in components.

### Semantic Token Layers

| Layer | Token | Use |
|-------|-------|-----|
| Page | `bg-background` | Root background |
| Card/Panel | `bg-surface` | Elevated containers |
| Modal/Popover | `bg-overlay` | Overlapping UI |
| Control | `bg-default` | Buttons, chips, inputs |

Each layer is slightly lighter than the one below, creating depth without shadows.

### Icons

- Library: `lucide-react`
- Default size: `w-4 h-4` (16px)
- Smaller: `w-3.5 h-3.5` (14px) for compact UI
- Larger: `w-5 h-5` (20px) for emphasis
- Always pair icon buttons with `aria-label`

## Deep Reference

- **[reference.md](./reference.md)** -- Full design system reference, layout patterns, accessibility checklist, animation guidelines
- **[patterns.md](./patterns.md)** -- Shipyard-specific conventions, case studies, common anti-patterns, design review checklist
