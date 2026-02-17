---
name: shipyard-accessibility
description: "Web accessibility expert following WCAG 2.2 and ARIA Authoring Practices. Use when implementing keyboard navigation, ARIA roles/states/properties, screen reader support, focus management, accessible forms, live regions, reduced motion, color contrast, or any a11y concern. Covers testing strategies and common anti-patterns."
---

# Accessibility Expert

A **domain skill** providing deep web accessibility knowledge grounded in WCAG 2.2 and WAI-ARIA Authoring Practices. This skill knows *what* makes UI accessible and *how* to implement it correctly — not which component to use (that's heroui-expert) or where to place things (that's design).

## The Four WCAG Principles (POUR)

Every requirement maps to one of these:

| Principle | Question | Key areas |
|-----------|----------|-----------|
| **Perceivable** | Can users sense it? | Alt text, captions, contrast, resize |
| **Operable** | Can users interact? | Keyboard, timing, seizures, navigation |
| **Understandable** | Can users comprehend? | Readable, predictable, input help |
| **Robust** | Does it work everywhere? | Valid markup, ARIA, assistive tech compat |

## Quick Reference: Keyboard Patterns

Every interactive widget needs a keyboard contract. These are the standard patterns from ARIA Authoring Practices:

| Widget | Tab | Arrow keys | Enter/Space | Escape |
|--------|-----|------------|-------------|--------|
| Button | Focus | — | Activate | — |
| Link | Focus | — | Navigate | — |
| Menu | Focus trigger | Move between items | Select item | Close menu |
| Dialog/Modal | Into first focusable | — | — | Close |
| Tabs | Focus active tab | Switch tabs | — | — |
| Listbox | Focus list | Move selection | — | — |
| Combobox | Focus input | Open/navigate list | Select item | Close list |
| Tree | Focus tree | Navigate nodes | Expand/collapse | — |
| Slider | Focus | Adjust value | — | — |
| Grid/Table | Focus cell | Navigate cells | Activate | — |

**Tab = move between widgets. Arrows = move within a widget.** This distinction is critical.

## Quick Reference: ARIA Essentials

### The Five Rules of ARIA

1. **Don't use ARIA if HTML does it** — `<button>` > `<div role="button">`
2. **Don't change native semantics** — Never `<h2 role="tab">`, use `<div role="tab">`
3. **All ARIA controls must be keyboard accessible** — `role="button"` needs Enter+Space+focus
4. **Don't hide focusable elements** — Never `aria-hidden="true"` on something focusable
5. **All interactive elements need accessible names** — via content, `aria-label`, or `aria-labelledby`

### Accessible Names (priority order)

1. `aria-labelledby` — references another visible element (preferred)
2. `aria-label` — string label (for icon-only buttons, no visible text)
3. Content — text inside the element (`<button>Save</button>`)
4. `<label for="id">` — for form controls
5. `title` — last resort, not announced by all screen readers

### Common ARIA Patterns

```tsx
/** Live region — announces dynamic changes */
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>

/** Icon button — needs explicit label */
<Button isIconOnly aria-label="Close dialog">
  <XIcon className="w-4 h-4" />
</Button>

/** Loading state — communicates to screen readers */
<div aria-busy={isLoading} aria-live="polite">
  {isLoading ? <Spinner aria-label="Loading" /> : content}
</div>

/** Landmark regions */
<nav aria-label="Main navigation">...</nav>
<main>...</main>
<aside aria-label="Filters">...</aside>

/** Disclosure / expandable */
<button aria-expanded={isOpen} aria-controls="panel-1">Details</button>
<div id="panel-1" hidden={!isOpen}>...</div>
```

## Quick Reference: Focus Management

### When to move focus programmatically

| Scenario | Move focus to |
|----------|---------------|
| Modal opens | First focusable element inside |
| Modal closes | The trigger that opened it |
| Item deleted from list | Next item, or previous if last |
| Route change (SPA) | Page heading or skip-link target |
| Inline error | The first invalid field |
| Toast/notification | Do NOT move focus (use `aria-live`) |

### Focus trap pattern

Modals and dialogs must trap focus — Tab/Shift+Tab cycles within the dialog, not behind it. HeroUI's Modal handles this automatically. For custom implementations, use `react-aria`'s `FocusScope`.

### Skip links

Every page needs a skip-to-content link as the first focusable element:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 ...">
  Skip to content
</a>
```

## Quick Reference: Color and Contrast

| Element | Min ratio | WCAG level |
|---------|-----------|------------|
| Body text (< 18px) | 4.5:1 | AA |
| Large text (>= 18px bold or >= 24px) | 3:1 | AA |
| UI components & graphical objects | 3:1 | AA |
| Focus indicators | 3:1 | AA |
| Enhanced body text | 7:1 | AAA |

**Never use color alone** to convey information. Always pair with icon, text, or pattern.

## Quick Reference: Forms

```tsx
/** Every input needs a label */
<TextField isRequired>
  <Label>Email address</Label>
  <Input type="email" />
  <Description>We'll never share your email.</Description>
  <FieldError>Please enter a valid email.</FieldError>
</TextField>

/** Group related controls */
<Fieldset>
  <Label>Notification preferences</Label>
  <CheckboxGroup>
    <Checkbox value="email"><Label>Email</Label></Checkbox>
    <Checkbox value="sms"><Label>SMS</Label></Checkbox>
  </CheckboxGroup>
</Fieldset>
```

- Error messages linked to inputs via `aria-describedby` (HeroUI does this)
- Required fields: use `isRequired` prop (adds `aria-required`)
- Autocomplete: use `autoComplete` attribute for browser autofill
- Inline validation: announce errors with `aria-live` or `role="alert"`

## Quick Reference: Reduced Motion

```css
/* Use Tailwind's motion utilities */
.animate-slide-in {
  @apply motion-safe:animate-slide-in motion-reduce:animate-none;
}

/* Or media query directly */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; }
}
```

Always provide `motion-safe:` / `motion-reduce:` variants for animations.

## Deep Reference

- **[reference.md](./reference.md)** — Full WCAG 2.2 checklist, ARIA roles/states/properties reference, screen reader behavior
- **[patterns.md](./patterns.md)** — Shipyard-specific patterns, testing strategies, common anti-patterns, remediation recipes
