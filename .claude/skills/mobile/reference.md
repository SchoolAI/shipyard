# Mobile -- Full Reference

## Container Queries vs Media Queries

### When to Use Each

| Use container queries when... | Use media queries (Tailwind responsive) when... |
|------|------|
| Component lives in different-width parents | Layout changes based on viewport width |
| Reusable component needs self-contained responsiveness | Page-level layout decisions (sidebar, grid columns) |
| Component is in a resizable panel | Global navigation changes |
| You want component-level breakpoints | You need `orientation`, `hover`, or `pointer` queries |

### Container Queries with Tailwind v4

```tsx
// Parent: mark as container
<div className="@container">
  {/* Child: respond to container width */}
  <div className="flex flex-col @md:flex-row @md:gap-4">
    <Avatar className="w-8 h-8 @md:w-12 @md:h-12" />
    <div className="@md:flex-1">
      <h3 className="text-sm @md:text-base">Title</h3>
    </div>
  </div>
</div>
```

Tailwind v4 container query breakpoints:
| Prefix | Width | Equivalent to |
|--------|-------|---------------|
| `@xs` | 320px | Small phone |
| `@sm` | 384px | Large phone |
| `@md` | 448px | Narrow panel / wide phone |
| `@lg` | 512px | Medium panel |
| `@xl` | 576px | Wide panel |
| `@2xl` | 672px | Desktop sidebar |

**Named containers** for specificity:

```tsx
<div className="@container/sidebar">
  <div className="@md/sidebar:flex-row">
```

### When NOT to Use Container Queries

- Don't nest `@container` more than 2 levels deep (performance, readability)
- Don't use for elements that are always full-viewport-width (media queries are simpler)
- Don't mix `@container` with `position: fixed` children (container context doesn't apply to fixed elements)

---

## Responsive Layout Patterns

### Sidebar Collapse

Desktop: persistent sidebar. Mobile: hidden, toggled via hamburger.

```tsx
// Sidebar component
<aside className={cn(
  "fixed inset-y-0 left-0 z-30 w-64 bg-surface border-r border-separator",
  "transition-transform duration-300",
  "md:relative md:translate-x-0",  // Desktop: always visible, in flow
  isOpen ? "translate-x-0" : "-translate-x-full"  // Mobile: slide in/out
)}>
  {children}
</aside>

// Backdrop (mobile only)
{isOpen && (
  <div
    className="fixed inset-0 z-20 bg-black/50 md:hidden"
    onClick={close}
  />
)}
```

### Panel to Full-Screen

Desktop: side panel. Mobile: full-screen overlay.

```tsx
<div className={cn(
  "fixed inset-y-0 right-0 z-30 bg-surface border-l border-separator",
  "w-full sm:w-[480px] sm:max-w-[50vw]",  // Full-width on mobile, constrained on desktop
  "transition-transform duration-300",
  isOpen ? "translate-x-0" : "translate-x-full"
)}>
```

### Stack to Grid

Most common responsive pattern. Single column on mobile, multi-column on desktop.

```tsx
// Cards: 1 col -> 2 col -> 3 col
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

// Metrics: 2 col (even mobile can fit 2) -> 4 col
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

// Form: single column always, just widen
<div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
```

### Bottom Sheet

Mobile pattern for contextual actions. Replaces dropdown menus on mobile.

```tsx
// Desktop: dropdown menu. Mobile: bottom sheet.
<div className={cn(
  "fixed z-50 bg-overlay rounded-t-2xl",
  "inset-x-0 bottom-0",  // Anchored to bottom
  "max-h-[70dvh] overflow-y-auto",  // Bounded height, scrollable
  "pb-[env(safe-area-inset-bottom)]",  // Respect home indicator
  "sm:relative sm:inset-auto sm:rounded-lg sm:max-h-none sm:w-64"  // Desktop: normal dropdown
)}>
```

### Responsive Typography

Text sizes rarely need to change across breakpoints. When they do:

```tsx
// Page title: larger on desktop
<h1 className="text-xl sm:text-2xl font-semibold">

// Body text: always text-sm (14px) -- don't change per breakpoint
<p className="text-sm">

// Hero text: scale up significantly on desktop
<h1 className="text-2xl sm:text-4xl font-bold">
```

**Rule**: Only scale headings and hero text. Body text (`text-sm`) stays consistent across all breakpoints.

---

## Touch and Gesture Handling

### Pointer Events vs Touch Events

**Always prefer Pointer Events.** They unify mouse, touch, pen, and work across all devices:

```tsx
// CORRECT: Pointer events (work everywhere)
onPointerDown={handleStart}
onPointerMove={handleMove}
onPointerUp={handleEnd}

// WRONG: Touch events (touch-only, need separate mouse handlers)
onTouchStart={handleStart}
onTouchMove={handleMove}
onTouchEnd={handleEnd}
```

### Drag Interactions

```tsx
const handlePointerDown = (e: React.PointerEvent) => {
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  // Pointer capture ensures all subsequent events go to this element,
  // even if the pointer moves outside it. Essential for drag.
};
```

**Required CSS for drag elements:**

```tsx
<div
  style={{ touchAction: 'none' }}  // Prevent browser scroll/zoom during drag
  onPointerDown={handlePointerDown}
>
```

### touch-action Values

| Value | Effect | Use for |
|-------|--------|---------|
| `none` | Disable all browser gestures | Custom drag/resize handles |
| `manipulation` | Allow scroll + tap, disable double-tap zoom | Buttons with fast tap response |
| `pan-x` | Allow horizontal scroll only | Vertical drag handles |
| `pan-y` | Allow vertical scroll only | Horizontal drag handles, carousels |
| `pinch-zoom` | Allow only pinch zoom | Custom pan, but allow zoom |

### Swipe Gestures

For swipe-to-dismiss, swipe-to-reveal, etc.:

```tsx
const SWIPE_THRESHOLD = 50; // px minimum for intentional swipe
const VELOCITY_THRESHOLD = 0.3; // px/ms for fast swipe

function useSwipe(onSwipe: (dir: 'left' | 'right') => void) {
  const startX = useRef(0);
  const startTime = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startTime.current = Date.now();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - startX.current;
    const dt = Date.now() - startTime.current;
    const velocity = Math.abs(dx) / dt;

    if (Math.abs(dx) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onSwipe(dx > 0 ? 'right' : 'left');
    }
  };

  return { onPointerDown, onPointerUp };
}
```

### Hover Scoping

```css
/* Only apply hover styles when the device supports real hover */
@media (hover: hover) and (pointer: fine) {
  .hoverable:hover {
    background: var(--surface);
  }
}
```

In Tailwind:
```tsx
// The hover: prefix in Tailwind already applies @media (hover: hover) in v4
<div className="hover:bg-surface">
```

**Don't rely on hover for discoverability.** Any action revealed by hover must also be accessible via:
- Long-press on touch (for context menus)
- Always-visible on mobile (for important actions)
- Keyboard focus (for accessibility)

---

## Performance on Mobile

### Layout Thrashing

Reading layout properties (offsetHeight, getBoundingClientRect) forces the browser to recalculate layout. On mobile, this is expensive:

```tsx
// BAD: read-write-read-write cycle
elements.forEach(el => {
  const height = el.offsetHeight;  // Forces layout
  el.style.height = `${height * 2}px`;  // Invalidates layout
});

// GOOD: batch reads, then batch writes
const heights = elements.map(el => el.offsetHeight);
elements.forEach((el, i) => {
  el.style.height = `${heights[i] * 2}px`;
});
```

### Scroll Performance

```tsx
// Use passive listeners for scroll (default in React, but be explicit in vanilla JS)
element.addEventListener('scroll', handler, { passive: true });

// Use will-change sparingly and only during animation
<div className="will-change-transform" /> // Only when actively animating

// Prefer transform animations (GPU-accelerated) over layout properties
className="transition-transform"  // GOOD: GPU composited
className="transition-[left]"     // BAD: triggers layout recalculation
```

### Image Loading

```tsx
// Lazy-load images below the fold
<img loading="lazy" decoding="async" src={url} alt={alt} />

// Responsive images with srcset
<img
  srcSet={`${url}?w=320 320w, ${url}?w=640 640w, ${url}?w=1280 1280w`}
  sizes="(max-width: 640px) 100vw, 640px"
  loading="lazy"
/>

// Use aspect-ratio to prevent layout shift
<div className="aspect-video bg-surface rounded-lg overflow-hidden">
  <img className="w-full h-full object-cover" loading="lazy" />
</div>
```

### Reducing JavaScript on Mobile

- **Dynamic imports** for heavy components not needed on mobile:

```tsx
const DesktopSidebar = lazy(() => import('./desktop-sidebar'));

function Layout() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  return isDesktop ? <Suspense><DesktopSidebar /></Suspense> : <MobileNav />;
}
```

- **Intersection Observer** for lazy rendering of off-screen content
- **`content-visibility: auto`** for long lists (Tailwind: `content-visibility-auto`)

---

## Mobile Testing Strategies

### Viewport Sizes to Test

| Device class | Width | Height | Test priority |
|-------------|-------|--------|--------------|
| Small phone (iPhone SE) | 375px | 667px | High |
| Standard phone (iPhone 14) | 390px | 844px | High |
| Large phone (iPhone 14 Pro Max) | 430px | 932px | Medium |
| Small tablet (iPad Mini) | 768px | 1024px | Medium |
| Tablet (iPad) | 1024px | 1366px | Low |

### Chrome DevTools Mobile Checklist

1. Toggle device toolbar (Cmd+Shift+M)
2. Test at 320px width (absolute minimum)
3. Test with "Show media queries" enabled
4. Test touch simulation (hover states shouldn't interfere)
5. Test with "Throttle network" to 3G (loading performance)
6. Check for horizontal overflow (scroll the page horizontally)

### Automated Testing

```tsx
// Playwright viewport test
test('mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  // Verify mobile navigation is visible
  await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  // Verify desktop sidebar is hidden
  await expect(page.locator('[data-testid="desktop-sidebar"]')).not.toBeVisible();
});
```

### Real Device Testing Priorities

1. **iOS Safari** -- Most divergent from Chrome DevTools emulation (viewport behavior, fixed positioning, rubber-band scroll)
2. **Android Chrome** -- Generally matches DevTools well
3. **iOS PWA (Add to Home Screen)** -- Different viewport behavior than Safari tabs

---

## Viewport Meta Tag

The correct viewport meta tag for Shipyard:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover"
/>
```

| Attribute | Value | Why |
|-----------|-------|-----|
| `width=device-width` | Match device width | Prevents desktop-width rendering |
| `initial-scale=1` | No zoom on load | Also eliminates 300ms tap delay |
| `viewport-fit=cover` | Extend behind notch/home indicator | Required for `env(safe-area-inset-*)` to work |

**Do NOT add:**
- `maximum-scale=1` -- Prevents pinch-to-zoom, accessibility violation (WCAG 1.4.4)
- `user-scalable=no` -- Same issue, prevents zoom
- `interactive-widget=resizes-content` -- Changes `dvh` behavior when keyboard opens, test thoroughly before adding

---

## Responsive Hook Patterns

### useMediaQuery

```tsx
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Usage
const isMobile = useMediaQuery('(max-width: 639px)');
const hasHover = useMediaQuery('(hover: hover)');
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
```

### useVisualViewport

For keyboard-aware layouts:

```tsx
function useVisualViewport() {
  const [viewport, setViewport] = useState({
    height: window.visualViewport?.height ?? window.innerHeight,
    offsetTop: window.visualViewport?.offsetTop ?? 0,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      setViewport({
        height: vv.height,
        offsetTop: vv.offsetTop,
      });
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  return viewport;
}

// Usage: detect keyboard open
const { height } = useVisualViewport();
const isKeyboardOpen = height < window.innerHeight * 0.75;
```

### useIsMobile (Convenience)

```tsx
const MOBILE_BREAKPOINT = 640; // matches Tailwind sm:

function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
```

---

## HeroUI + React Aria: Free Mobile Behaviors

HeroUI v3 is built on React Aria, which handles many mobile concerns automatically. **Don't reimplement these:**

| Behavior | How it works | You get it from |
|----------|-------------|----------------|
| Touch vs mouse normalization | `usePress` unifies all input types, exposes `pointerType` | Every HeroUI button/link/pressable |
| No sticky hover on touch | `data-hovered` is NOT applied on touch devices | All HeroUI interactive components |
| Keyboard-only focus rings | `data-focus-visible` only shows for keyboard nav, not touch/mouse | All HeroUI focusable components |
| Scroll cancels press | Press interaction canceled when user scrolls (prevents accidental taps) | `usePress` |
| Mobile screen reader dismiss | Hidden `DismissButton` added to overlays for VoiceOver/TalkBack | Modal, Popover, Drawer |
| Focus trapping in overlays | FocusScope manages trap + restore on close | Modal, Popover |
| Body scroll lock | Prevents scroll behind open overlays on mobile | Modal |
| Long press for context menu | `useLongPress` hook with configurable threshold | Import from `react-aria` |

**Building mobile overlays from Modal primitives** (HeroUI v3 has no built-in Drawer or BottomSheet for web):
- Drawer: `Modal.Backdrop` + `Modal.Container` with fixed positioning + slide animation
- Bottom sheet: `Modal.Container` with `placement="bottom"` + `size="full"` + responsive className
- See `heroui-expert` skill patterns.md for implementation details

---

## Scroll Behavior Patterns

### Sticky Headers

```tsx
<header className="sticky top-0 z-20 bg-surface/95 backdrop-blur-sm border-b border-separator">
```

**Gotcha**: `sticky` doesn't work if any ancestor has `overflow: hidden` or `overflow: auto`. Check the DOM tree.

### Scroll Snap (Carousels)

```tsx
<div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-4">
  {items.map(item => (
    <div key={item.id} className="snap-start shrink-0 w-[85vw] sm:w-64">
      <Card>{item.content}</Card>
    </div>
  ))}
</div>
```

### Prevent Scroll Chaining

When a modal or drawer is open, prevent scrolling the page behind it:

```tsx
// On the scrollable overlay content
<div className="overscroll-contain overflow-y-auto">

// On body when modal is open (via useEffect)
document.body.style.overflow = 'hidden';
// Restore on cleanup
document.body.style.overflow = '';
```

### Pull-to-Refresh Prevention

If the app handles its own refresh mechanism:

```css
/* Prevent native pull-to-refresh */
html {
  overscroll-behavior-y: contain;
}
```
