# Mobile -- Shipyard Patterns

Conventions and patterns specific to the Shipyard codebase for mobile support.

## Current State

Shipyard is a **desktop-first app with mobile accommodations**. The app works on mobile but wasn't designed mobile-first. Key existing patterns:

- **Sidebar**: Hidden on mobile (`hidden md:flex`), toggle via hamburger (`md:hidden`)
- **Diff panel**: Becomes full-width on small screens (`max-sm:!w-full max-sm:min-w-0`)
- **Viewport height**: Uses `h-dvh` (correct) instead of `h-screen`
- **Touch drag**: `touchAction: 'none'` on resize handles with pointer events
- **Breakpoints**: Standard Tailwind defaults (`sm:` 640px, `md:` 768px)
- **Responsive spacing**: `px-3 sm:px-4`, `py-4 sm:py-6` pattern established
- **Content width**: `max-w-3xl mx-auto` for chat readability

### Gaps to Address

- No safe area handling for notched devices
- No bottom navigation pattern
- No explicit `lg:` or `xl:` breakpoint usage for large screens
- `max-sm:!w-full` uses `!important` override (specificity smell)
- No responsive image strategy
- No `@media (hover: hover)` scoping for hover-dependent UI

---

## Shipyard Mobile Layout Architecture

### The App Shell

```
Mobile (< 640px):
┌──────────────────────┐
│ TopBar (sticky)      │
├──────────────────────┤
│                      │
│ Content (flex-1,     │
│ overflow-y-auto)     │
│                      │
│                      │
├──────────────────────┤
│ Composer (shrink-0)  │
├──────────────────────┤
│ BottomNav (fixed)    │  <- future: add bottom nav
│ + safe-area padding  │
└──────────────────────┘

Desktop (>= 768px):
┌─────┬────────────────────────┬─────────┐
│ Side│ TopBar                  │         │
│ bar │────────────────────────│ Panel   │
│     │ Content (flex-1)       │ (toggle)│
│     │                        │         │
│     │────────────────────────│         │
│     │ Composer               │         │
│     │────────────────────────│         │
│     │ Terminal (toggle)      │         │
└─────┴────────────────────────┴─────────┘
```

### Key Layout Decisions

| Component | Mobile behavior | Desktop behavior |
|-----------|----------------|-----------------|
| Sidebar | Hidden, hamburger toggle | Persistent, collapsible |
| Diff panel | Full-screen overlay | Side panel (40vw) |
| Terminal panel | Full-width, fixed height | Full-width, resizable |
| Composer | Full-width, above keyboard | Full-width, bottom of content |
| Top bar | Sticky, compact | Sticky, full actions |
| Bottom nav | Fixed bottom (future) | Hidden |

---

## Mobile-Specific Component Patterns

### Responsive Modal / Bottom Sheet

Modals should become bottom sheets on mobile for thumb-reachable interaction:

```tsx
function ResponsiveDialog({ isOpen, onClose, title, children }) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <Modal.Backdrop className="bg-black/50" />
      <Modal.Content className={cn(
        // Mobile: bottom sheet
        "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[85dvh]",
        "pb-[env(safe-area-inset-bottom)]",
        // Desktop: centered dialog
        "sm:inset-auto sm:relative sm:rounded-2xl sm:max-h-none sm:max-w-md sm:mx-auto"
      )}>
        <Modal.Header>
          {/* Drag handle on mobile */}
          <div className="w-8 h-1 rounded-full bg-muted/30 mx-auto mb-4 sm:hidden" />
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="overflow-y-auto">
          {children}
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
}
```

### Mobile-Friendly Dropdowns

Replace dropdown menus with action sheets on mobile:

```tsx
function ResponsiveMenu({ trigger, items }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <BottomSheet trigger={trigger}>
        {items.map(item => (
          <button
            key={item.key}
            className="flex items-center gap-3 w-full px-4 py-3 min-h-11 text-left"
            onPress={item.onPress}
          >
            {item.icon}
            <span className="text-sm">{item.label}</span>
          </button>
        ))}
      </BottomSheet>
    );
  }

  return (
    <Dropdown>
      <Dropdown.Trigger>{trigger}</Dropdown.Trigger>
      <Dropdown.Menu>
        {items.map(item => (
          <Dropdown.Item key={item.key} onPress={item.onPress}>
            {item.icon}
            {item.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
```

### Collapsible Toolbars

Dense toolbars need simplification on mobile:

```tsx
<div className="flex items-center gap-1 px-2 py-1">
  {/* Always visible: essential actions */}
  <Button isIconOnly size="sm" aria-label="Bold"><Bold className="w-4 h-4" /></Button>
  <Button isIconOnly size="sm" aria-label="Italic"><Italic className="w-4 h-4" /></Button>

  {/* Desktop only: secondary actions */}
  <div className="hidden sm:flex items-center gap-1">
    <Button isIconOnly size="sm" aria-label="Strikethrough"><Strikethrough className="w-4 h-4" /></Button>
    <Button isIconOnly size="sm" aria-label="Code"><Code className="w-4 h-4" /></Button>
  </div>

  {/* Mobile: overflow menu for hidden actions */}
  <div className="sm:hidden">
    <OverflowMenu>
      <OverflowMenu.Item>Strikethrough</OverflowMenu.Item>
      <OverflowMenu.Item>Code</OverflowMenu.Item>
    </OverflowMenu>
  </div>
</div>
```

---

## Common Anti-Patterns in Shipyard

### !important Overrides for Mobile

```tsx
// BAD: specificity hack
<div className="min-w-[400px] max-sm:!w-full max-sm:min-w-0">

// GOOD: mobile-first, no override needed
<div className="w-full min-w-0 sm:min-w-[400px]">
```

**Why**: `!important` makes future overrides harder and signals the base styles are desktop-first.

### Desktop-First max-sm: Pattern

```tsx
// BAD: writing for desktop, then removing for mobile
<div className="flex-row gap-4 px-6 max-sm:flex-col max-sm:gap-2 max-sm:px-3">

// GOOD: mobile-first, enhance for desktop
<div className="flex-col gap-2 px-3 sm:flex-row sm:gap-4 sm:px-6">
```

### Hover-Only Actions

```tsx
// BAD: actions only visible on hover
<div className="group">
  <span>{item.name}</span>
  <button className="opacity-0 group-hover:opacity-100">Delete</button>
</div>

// GOOD: always visible on mobile, hover-reveal on desktop
<div className="group">
  <span>{item.name}</span>
  <button className="sm:opacity-0 sm:group-hover:opacity-100">Delete</button>
</div>
```

### Fixed Height Elements

```tsx
// BAD: fixed pixel heights break with dynamic content
<div className="h-[600px] overflow-hidden">

// GOOD: flexible with constraints
<div className="min-h-[200px] max-h-[70dvh] overflow-y-auto">
```

### Missing touch-action on Custom Interactions

```tsx
// BAD: browser fights your gesture handler
<div onPointerDown={startDrag} onPointerMove={drag}>

// GOOD: tell browser to back off
<div
  style={{ touchAction: 'none' }}
  onPointerDown={startDrag}
  onPointerMove={drag}
>
```

### Not Accounting for Keyboard

```tsx
// BAD: composer fixed to bottom, keyboard pushes it off-screen on iOS
<div className="fixed bottom-0 inset-x-0">
  <textarea />
</div>

// GOOD: sticky within scroll context, keyboard pushes content up naturally
<div className="sticky bottom-0 inset-x-0">
  <textarea />
</div>
```

---

## Mobile Review Checklist

When reviewing UI changes for mobile compatibility:

### Viewport & Layout
- [ ] Uses `h-dvh` not `h-screen` for full-height layouts
- [ ] No `100vh` in inline styles or custom CSS
- [ ] Content readable at 320px width (no horizontal overflow)
- [ ] No `position: fixed` on elements that interact with the keyboard
- [ ] `overflow-x-auto` on any potentially wide content (tables, code)

### Touch & Interaction
- [ ] Touch targets minimum 44x44px (check icon buttons especially)
- [ ] Minimum 8px gap between adjacent touch targets
- [ ] No hover-only discoverability (actions accessible without hover)
- [ ] Custom drag handlers have `touchAction: 'none'`
- [ ] `@media (hover: hover)` for hover-dependent styles (or Tailwind `hover:` which does this)

### Responsive Approach
- [ ] Base styles are mobile layout, `sm:`/`md:` add desktop
- [ ] No `max-sm:!important` overrides (rewrite mobile-first)
- [ ] Sidebars/panels collapse to overlay on mobile
- [ ] Modals usable on mobile (not wider than viewport)
- [ ] Forms don't have side-by-side fields on mobile

### Performance
- [ ] Images have `loading="lazy"` below the fold
- [ ] Heavy desktop-only components use dynamic import
- [ ] No layout thrashing in scroll/resize handlers
- [ ] Animations use `transform`/`opacity` (GPU-composited)

### Safe Areas & Browser Chrome
- [ ] Bottom-fixed elements have `pb-[env(safe-area-inset-bottom)]`
- [ ] `viewport-fit=cover` in viewport meta tag
- [ ] Virtual keyboard doesn't obscure input fields
- [ ] Content doesn't hide behind mobile browser address bar

---

## Key Files in Shipyard

| File | Mobile relevance |
|------|-----------------|
| `apps/web/index.html` | Viewport meta tag |
| `apps/web/src/app.css` | Global styles, safe areas, motion preferences |
| `apps/web/src/components/sidebar.tsx` | Mobile sidebar toggle pattern |
| `apps/web/src/components/top-bar.tsx` | Mobile header with hamburger |
| `apps/web/src/components/chat-page.tsx` | Main layout with responsive panels |
| `apps/web/src/components/panels/diff-panel.tsx` | Panel collapse pattern |
| `apps/web/src/hooks/use-resizable-panel.ts` | Touch-aware resize with pointer events |
| `apps/web/src/hooks/use-theme-effect.ts` | Media query listener pattern |
