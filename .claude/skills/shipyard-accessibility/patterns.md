# Accessibility Patterns

Shipyard-specific conventions, testing strategies, common anti-patterns, and remediation recipes.

---

## Shipyard Accessibility Conventions

### HeroUI v3 Does Most of the Work

HeroUI v3 is built on React Aria Components, which means most ARIA patterns are handled automatically:
- Focus management in modals, popovers, dropdowns
- Keyboard navigation in tabs, menus, listboxes
- Label/description association in form fields
- Press events (Enter + Space) on buttons
- Roving tabindex in composite widgets

**Your job is to not break what HeroUI gives you.** The most common accessibility bugs come from:
1. Wrapping HeroUI components in custom divs that intercept keyboard events
2. Using `onClick` instead of `onPress` on HeroUI Buttons
3. Missing `aria-label` on icon-only buttons
4. Adding `tabIndex` to non-interactive elements

### Required Patterns in Shipyard

**Every page/view must have:**
- A skip-to-content link (first focusable element)
- An `<h1>` (even if visually hidden with `sr-only`)
- Landmark regions (`<main>`, `<nav>`, etc.)
- `<html lang="en">`

**Every interactive component must have:**
- Visible focus indicator (HeroUI provides these — don't override `outline-none` without replacing)
- Accessible name (visible text, `aria-label`, or `aria-labelledby`)
- Keyboard activation (Enter/Space for buttons, Enter for links)

**Every form must have:**
- Labels on all inputs (`<Label>` component, not placeholder-only)
- Error messages linked to inputs (HeroUI's `<FieldError>` does this)
- Required field indication (`isRequired` prop)
- Logical tab order

**Every dynamic update must have:**
- `aria-live` region for status messages (toast notifications, save confirmations)
- `aria-busy` during loading states
- Focus management after destructive actions (delete → focus next item)

### Chat UI Accessibility (Shipyard-specific)

The chat interface has unique accessibility requirements:

```tsx
/** Message list — use log role for append-only chat */
<div role="log" aria-label="Conversation" aria-live="polite">
  {messages.map(msg => (
    <article key={msg.id} aria-label={`${msg.role} message`}>
      {msg.content}
    </article>
  ))}
</div>

/** Composer — rich text input with label */
<div role="form" aria-label="Message composer">
  <label htmlFor="composer-input" className="sr-only">Type a message</label>
  <textarea id="composer-input" aria-describedby="composer-hint" />
  <p id="composer-hint" className="sr-only">Press Enter to send, Shift+Enter for new line</p>
</div>

/** Panel toggles — communicate expanded state */
<Button
  aria-expanded={isTerminalOpen}
  aria-controls="terminal-panel"
  aria-label="Toggle terminal"
>
  <TerminalIcon />
</Button>
<div id="terminal-panel" role="region" aria-label="Terminal output">
  ...
</div>
```

### Hotkey Accessibility

Shipyard uses keyboard shortcuts (Cmd+`, Cmd+Shift+G). These must:
- Be documented in an accessible way (Kbd component, help dialog)
- Not conflict with screen reader shortcuts
- Not use single character keys without a modifier (WCAG 2.1.4)
- Be discoverable (show in tooltips on hover/focus of trigger buttons)

---

## Testing Strategies

### Automated Testing

**What to automate:**
- axe-core integration tests (catches ~30-40% of WCAG issues)
- Role and label assertions in component tests
- Tab order verification
- Contrast ratio checks on theme tokens

```tsx
/** Vitest + @testing-library/react */
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('composer has no a11y violations', async () => {
  const { container } = render(<ChatComposer />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});

test('icon buttons have accessible names', () => {
  render(<ToolbarButton icon={<BoldIcon />} />);
  expect(screen.getByRole('button')).toHaveAccessibleName();
});

test('tab order is logical', async () => {
  render(<ChatPage />);
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole('textbox', { name: /message/i })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', { name: /send/i })).toHaveFocus();
});
```

**What you cannot automate (requires manual testing):**
- Screen reader announcement quality
- Focus management after dynamic changes
- Keyboard trap detection in complex flows
- Visual focus indicator visibility
- Reading order vs visual order mismatch

### Manual Testing Checklist

Run through this for every new view/component:

1. **Keyboard-only navigation**
   - [ ] Tab through all interactive elements — logical order?
   - [ ] Shift+Tab goes backwards correctly?
   - [ ] Enter/Space activates buttons?
   - [ ] Escape closes overlays?
   - [ ] Arrow keys work in composite widgets (tabs, menus)?
   - [ ] No keyboard traps (can Tab away from everything)?

2. **Screen reader (VoiceOver on macOS)**
   - [ ] Cmd+F5 to enable
   - [ ] VO+Right Arrow to read through content — makes sense?
   - [ ] Headings navigation (VO+Cmd+H) — all headings present?
   - [ ] Landmarks navigation (VO+Cmd+M, VO+Cmd+U) — regions labeled?
   - [ ] Form controls have labels read aloud?
   - [ ] Dynamic changes announced (toasts, errors, loading)?

3. **Visual checks**
   - [ ] Focus indicators visible on all interactive elements?
   - [ ] Contrast sufficient (check in DevTools)?
   - [ ] Text readable at 200% zoom?
   - [ ] No horizontal scrollbar at 320px width?
   - [ ] Color not the only indicator for status/errors?

4. **Reduced motion**
   - [ ] Set `prefers-reduced-motion: reduce` in DevTools
   - [ ] Animations stopped or minimal?
   - [ ] Content still functions without animation?

### Playwriter-Based Testing

Use the design-expert agent with Playwriter for visual accessibility inspection:

```js
/** Check accessibility tree */
const snapshot = await accessibilitySnapshot({ page });

/** Verify focus indicator visibility */
await page.keyboard.press('Tab');
await screenshotWithAccessibilityLabels({ page });

/** Check at mobile viewport */
await page.setViewportSize({ width: 320, height: 568 });
await screenshotWithAccessibilityLabels({ page });

/** Verify zoom behavior */
await page.evaluate(() => document.body.style.zoom = '200%');
await screenshotWithAccessibilityLabels({ page });
```

---

## Common Anti-Patterns and Fixes

### 1. Div soup with click handlers

```tsx
/** BAD — div is not keyboard accessible */
<div onClick={handleClick} className="cursor-pointer">
  Click me
</div>

/** GOOD — use a button */
<Button onPress={handleClick} variant="ghost">
  Click me
</Button>

/** If you truly need a clickable div (rare), add all required attributes */
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
>
  Click me
</div>
```

### 2. Placeholder as label

```tsx
/** BAD — placeholder disappears on input, SR may not announce */
<Input placeholder="Enter your email" />

/** GOOD — visible label, placeholder is supplementary */
<TextField>
  <Label>Email</Label>
  <Input placeholder="user@example.com" />
</TextField>

/** OK — visually hidden label for compact layouts */
<TextField>
  <Label className="sr-only">Email</Label>
  <Input placeholder="Enter your email" />
</TextField>
```

### 3. Missing link text

```tsx
/** BAD — screen reader announces "link" with no context */
<a href="/profile"><AvatarIcon /></a>

/** GOOD */
<a href="/profile" aria-label="View profile"><AvatarIcon /></a>

/** BETTER — visible text */
<a href="/profile"><AvatarIcon /> Profile</a>
```

### 4. Auto-focus on page load

```tsx
/** BAD — hijacks focus, confuses SR users */
useEffect(() => { inputRef.current?.focus(); }, []);

/** GOOD — only auto-focus when user initiated the action */
useEffect(() => {
  if (userOpenedDialog) inputRef.current?.focus();
}, [userOpenedDialog]);
```

### 5. Hiding content incorrectly

```tsx
/** BAD — removes from both visual and accessibility tree */
<div style={{ display: 'none' }}>Important for SR</div>

/** GOOD — visually hidden but available to screen readers */
<span className="sr-only">3 unread messages</span>

/** GOOD — hidden from SR but visible (decorative) */
<div aria-hidden="true"><DecorativeIcon /></div>

/** BAD — hides from SR but element is focusable */
<button aria-hidden="true">Submit</button>
```

### 6. Removing focus outlines

```tsx
/** BAD — removes focus indicator entirely */
<button className="outline-none focus:outline-none">Save</button>

/** GOOD — custom focus style that's visible */
<button className="focus:outline-2 focus:outline-accent focus:outline-offset-2">
  Save
</button>

/** GOOD — use HeroUI's built-in focus ring (default behavior) */
<Button>Save</Button>
```

### 7. Tab index abuse

```tsx
/** BAD — positive tabindex creates unpredictable order */
<input tabIndex={5} />
<input tabIndex={1} />
<input tabIndex={3} />

/** GOOD — use DOM order, only 0 or -1 */
<input /> {/* tabIndex=0 by default */}
<input />
<input />
<div tabIndex={-1} /> {/* focusable programmatically, not in tab order */}
```

### 8. Live region not in DOM on mount

```tsx
/** BAD — SR won't detect changes if region is added dynamically */
{error && <div role="alert">{error}</div>}

/** GOOD — region exists in DOM, content changes trigger announcement */
<div role="alert" aria-live="assertive">
  {error ?? ''}
</div>
```

### 9. Missing heading hierarchy

```tsx
/** BAD — skipping from h1 to h4 */
<h1>Dashboard</h1>
<h4>Recent Activity</h4>

/** GOOD — sequential levels */
<h1>Dashboard</h1>
<h2>Recent Activity</h2>

/** OK — visually styled differently but correct hierarchy */
<h2 className="text-sm font-semibold">Recent Activity</h2>
```

### 10. Custom scrollable regions without keyboard access

```tsx
/** BAD — scrollable div not keyboard navigable */
<div className="overflow-y-auto h-64">
  {longContent}
</div>

/** GOOD — focusable and labeled */
<div
  className="overflow-y-auto h-64"
  tabIndex={0}
  role="region"
  aria-label="Conversation history"
>
  {longContent}
</div>
```

---

## Remediation Priority

When fixing accessibility issues, prioritize by user impact:

1. **Critical** — Blocks functionality: keyboard traps, missing form labels, no focus management in modals
2. **High** — Degrades experience: missing alt text, no live regions, broken tab order
3. **Medium** — Inconvenient: missing skip links, poor heading hierarchy, decorative images with alt text
4. **Low** — Polish: redundant ARIA, suboptimal landmark structure, missing `lang` on foreign text

Fix critical and high issues before shipping. Medium issues should be addressed in the same sprint. Low issues go in the backlog.
