# ADR 0002: Use Sonner for Toast Notifications

## Status

**Accepted** (2026-01-05)

## Context

We need toast notifications for user feedback (e.g., "Profile saved", "Ready to comment"). The project uses HeroUI v3 (beta) for UI components.

**Problem:** HeroUI v3 does not include a Toast component. Toast exists only in HeroUI v2 (`@heroui/toast@2.x`).

**Why we're on HeroUI v3:**
- Built on React Aria Components (Adobe) — automatic WCAG accessibility
- Compound component pattern — more flexible composition
- No provider required — simpler setup
- Tailwind CSS v4 support
- Future-proof architecture

**Mixing v2 and v3 is risky:**
- Different styling systems (v2 uses different CSS variables)
- Potential conflicts with compound component patterns
- v2 components expect `<HeroUIProvider>` which v3 doesn't use

## Decision

Use **sonner** (`sonner@1.x`) for toast notifications.

Sonner is a lightweight, headless toast library that:
- Works independently of any UI framework
- Provides clean, minimal styling that adapts to our theme
- Has excellent accessibility (ARIA live regions, focus management)
- Supports promise-based toasts for async operations

## Configuration Required

**Dark mode requires explicit theme prop.** Sonner does not auto-detect `data-theme` attributes.

We use a `ThemedToaster` wrapper component (`apps/web/src/components/ThemedToaster.tsx`) that:
1. Uses our `useTheme` hook to get the resolved theme (light/dark)
2. Passes the theme to Sonner's `Toaster` component

This ensures toasts follow the user's in-app theme choice, not just system preference.

**CSS fallback:** We also define Sonner CSS variables in `index.css` that inherit from our theme variables, providing defense-in-depth if the theme prop fails.

## Consequences

### Positive

- Clean API: `toast.success("Saved!")` — no complex setup
- Adapts to light/dark themes via ThemedToaster wrapper
- Small bundle (~3KB gzipped)
- No conflicts with HeroUI v3 components
- Can be removed easily when HeroUI v3 adds native Toast

### Negative

- Additional dependency outside HeroUI ecosystem
- Styling won't perfectly match HeroUI components
- Two different notification patterns if we later use HeroUI v3 Toast

### Mitigations

- Sonner's default styling is minimal and professional
- Can customize with CSS variables to match our theme
- Will migrate to HeroUI v3 Toast when it's released (track: https://github.com/heroui-inc/heroui)

## Alternatives Considered

1. **@heroui/toast (v2)** — Rejected due to v2/v3 compatibility concerns
2. **react-hot-toast** — Similar to sonner but slightly larger, less active maintenance
3. **Custom Alert-based toast** — More work, would reinvent wheel
4. **No toasts, use inline alerts** — Poor UX for transient feedback

## References

- [Sonner GitHub](https://github.com/emilkowalski/sonner)
- [HeroUI v3 component list](https://v3.heroui.com/docs/react/components) — no Toast as of beta.3
- [HeroUI v2 Toast docs](https://www.heroui.com/docs/components/toast) — v2 only

## Revisit Criteria

- When HeroUI v3 releases stable Toast component
- If sonner causes bundle size concerns
- If we need deeply integrated toast behavior (e.g., toasts in modals)

---

*Created: 2026-01-05*
