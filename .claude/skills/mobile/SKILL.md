---
name: mobile
description: "Mobile-first responsive design specialist. Use when building mobile layouts, handling touch interactions, viewport issues, safe areas, bottom navigation, responsive collapse patterns, virtual keyboard handling, or any mobile-specific concern. Covers touch targets, gesture patterns, viewport units (dvh/svh/lvh), container queries, mobile navigation, performance, and progressive enhancement from mobile to desktop."
---

# Mobile Design

A **domain skill** for building mobile-first, responsive interfaces that don't paint you into a corner. This skill goes deep on mobile-specific concerns -- the design skill covers *what* to build responsively, this skill covers *how* to handle mobile's unique constraints and pitfalls.

## Mental Model

**Mobile is not "small desktop."** Mobile has different:
- **Input model** -- fingers, not cursors (no hover, imprecise, occlude the target)
- **Viewport model** -- dynamic (address bar, keyboard, notch, home indicator)
- **Context model** -- interrupted attention, one-handed use, variable network
- **Layout model** -- vertical-first, scroll-heavy, no multi-window

Build for these constraints first. Desktop enhancements come later.

## The Mobile-First Contract

Write the mobile layout as the default CSS, then add complexity at breakpoints:

```tsx
// CORRECT: mobile-first (default is mobile, sm: adds desktop)
<div className="flex flex-col gap-3 px-3 sm:flex-row sm:gap-4 sm:px-4">

// WRONG: desktop-first (default is desktop, override for mobile)
<div className="flex flex-row gap-4 px-4 max-sm:flex-col max-sm:gap-3 max-sm:px-3">
```

`max-sm:` is an escape hatch, not a pattern. If you're writing more `max-sm:` than `sm:`, the base styles are wrong.

## Quick Reference: Viewport Units

| Unit | Resolves to | Use when |
|------|-------------|----------|
| `dvh` | Dynamic viewport (shrinks/grows with address bar) | **Default choice.** Full-height layouts, `h-dvh` |
| `svh` | Smallest viewport (address bar visible) | Content must never be hidden behind browser chrome |
| `lvh` | Largest viewport (address bar hidden) | Background images, decorative full-bleed |
| `vh` | Legacy (equals `lvh` on most mobile browsers) | **Avoid.** Causes content to hide behind address bar |

**Rule**: Use `h-dvh` instead of `h-screen` for full-height layouts. Tailwind's `h-screen` is `100vh` which doesn't account for mobile browser chrome.

## Quick Reference: Touch Targets

| Context | Minimum size | Tailwind |
|---------|-------------|----------|
| Primary actions | 48x48px | `min-w-12 min-h-12` |
| Secondary actions | 44x44px | `min-w-11 min-h-11` |
| Dense toolbars (desktop) | 32x32px | `min-w-8 min-h-8` but add `sm:min-w-8` |

Touch targets include padding. A 16px icon in a 44px button is fine:

```tsx
<Button isIconOnly size="sm" className="min-w-11 min-h-11 sm:min-w-8 sm:min-h-8">
  <X className="w-4 h-4" />
</Button>
```

**Spacing between targets**: Minimum 8px gap to prevent mis-taps. Use `gap-2` minimum in mobile toolbars.

## Quick Reference: Safe Areas

For devices with notches, dynamic islands, and home indicators:

```css
/* In app.css or global styles */
:root {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

Or per-component with Tailwind arbitrary values:

```tsx
// Bottom nav that respects home indicator
<nav className="pb-[env(safe-area-inset-bottom)]">

// Full-width content that respects notch
<div className="px-[max(1rem,env(safe-area-inset-left))]">
```

**Required in**: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` -- the `viewport-fit=cover` enables safe area insets.

## Quick Reference: Mobile Navigation Patterns

| Pattern | Best for | HeroUI component |
|---------|----------|-----------------|
| Bottom tab bar | 3-5 primary destinations | Custom (no HeroUI bottom nav) |
| Hamburger drawer | 6+ nav items, secondary nav | `Drawer` (from Modal primitives) |
| Top tabs | 2-4 peer views within a page | `Tabs` |
| Back button + title | Deep hierarchical navigation | Custom top bar |

**Bottom nav pattern** (most common for mobile apps):

```tsx
<nav className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-separator pb-[env(safe-area-inset-bottom)]">
  <div className="flex items-center justify-around h-14">
    <NavItem icon={Home} label="Home" active />
    <NavItem icon={Search} label="Search" />
    <NavItem icon={Bell} label="Alerts" />
    <NavItem icon={User} label="Profile" />
  </div>
</nav>
```

## Quick Reference: Virtual Keyboard

The virtual keyboard is the #1 source of mobile layout bugs:

```tsx
// Detect keyboard with Visual Viewport API
const isKeyboardOpen = window.visualViewport
  && window.visualViewport.height < window.innerHeight * 0.75;
```

**Rules**:
1. **Never use `position: fixed` on elements that should stay visible when keyboard opens** -- use `position: sticky` or flow-based layout instead
2. **Bottom-fixed elements** (nav bars, composers) get pushed off-screen by keyboard on iOS -- use `visualViewport.height` to reposition
3. **Input focus scrolling** -- browsers auto-scroll focused inputs into view, but `overflow: hidden` on ancestors can prevent this
4. **`interactive-widget=resizes-content`** viewport meta -- makes `dvh` resize when keyboard opens (opt-in, test carefully)

## Common Gotchas

1. **`position: fixed` + iOS keyboard** -- Fixed elements don't move when keyboard opens on iOS. The viewport shrinks but fixed positioning uses the full viewport. Use `position: sticky` or `visualViewport` API.

2. **`overflow: hidden` on body** -- Prevents scroll-to-input on iOS. Use `overflow: clip` instead, or avoid body overflow restrictions.

3. **`:hover` states on touch** -- Touch devices trigger `:hover` on tap and it sticks until the user taps elsewhere. Use `@media (hover: hover)` to scope hover styles to devices with actual hover capability.

4. **300ms tap delay** -- Modern browsers eliminated this for pages with `<meta name="viewport">`, but custom gesture handlers can reintroduce it. Use `touch-action: manipulation` on elements with custom touch handling.

5. **Momentum scrolling** -- iOS `-webkit-overflow-scrolling: touch` is now the default. Don't add it. But `overscroll-behavior: contain` is still needed to prevent scroll chaining (scrolling past a modal into the page behind it).

6. **`100vh` on mobile** -- The classic trap. `100vh` equals the largest viewport height, so content hides behind the address bar. Always use `h-dvh` (maps to `100dvh`).

7. **Horizontal overflow** -- A single element wider than the viewport (long URL, wide table, unbroken text) creates horizontal scroll on the entire page. Use `overflow-x-auto` on containers and `break-words` on text.

8. **`z-index` stacking on iOS Safari** -- `position: fixed` creates a new stacking context. Modals inside fixed containers need careful z-index management. Prefer portaling overlays to document root.

## Deep Reference

- **[reference.md](./reference.md)** -- Container queries, responsive patterns, gesture handling, performance, testing strategies
- **[patterns.md](./patterns.md)** -- Shipyard-specific mobile patterns, layout case studies, anti-patterns, mobile review checklist
