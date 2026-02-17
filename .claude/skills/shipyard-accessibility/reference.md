# Accessibility Reference

Complete reference for WCAG 2.2, ARIA, and screen reader behavior.

---

## WCAG 2.2 Success Criteria Checklist

Organized by principle. Level A = minimum, AA = standard target, AAA = enhanced.

### Perceivable

| # | Criterion | Level | Key requirement |
|---|-----------|-------|-----------------|
| 1.1.1 | Non-text content | A | All images/icons have text alternatives |
| 1.2.1 | Audio/video (prerecorded) | A | Captions or transcript |
| 1.3.1 | Info and relationships | A | Semantic HTML conveys structure (headings, lists, tables, landmarks) |
| 1.3.2 | Meaningful sequence | A | DOM order matches visual order |
| 1.3.3 | Sensory characteristics | A | Don't rely on shape/size/position alone ("click the round button") |
| 1.3.4 | Orientation | AA | Content works in portrait AND landscape |
| 1.3.5 | Identify input purpose | AA | Use `autoComplete` on identity/payment fields |
| 1.4.1 | Use of color | A | Color is not the only visual means of conveying info |
| 1.4.2 | Audio control | A | Auto-playing audio can be paused/stopped |
| 1.4.3 | Contrast (minimum) | AA | Text 4.5:1, large text 3:1 |
| 1.4.4 | Resize text | AA | Text resizes to 200% without loss |
| 1.4.5 | Images of text | AA | Use real text, not images of text |
| 1.4.10 | Reflow | AA | Content reflows at 320px wide (no horizontal scroll) |
| 1.4.11 | Non-text contrast | AA | UI components and graphics 3:1 against adjacent colors |
| 1.4.12 | Text spacing | AA | Content works with user-increased line/letter/word spacing |
| 1.4.13 | Content on hover/focus | AA | Hover/focus content dismissible, hoverable, persistent |

### Operable

| # | Criterion | Level | Key requirement |
|---|-----------|-------|-----------------|
| 2.1.1 | Keyboard | A | All functionality available via keyboard |
| 2.1.2 | No keyboard trap | A | Focus can move away from every component |
| 2.1.4 | Character key shortcuts | A | Single-key shortcuts can be turned off or remapped |
| 2.4.1 | Bypass blocks | A | Skip links to bypass repeated navigation |
| 2.4.2 | Page titled | A | Pages have descriptive `<title>` |
| 2.4.3 | Focus order | A | Tab order follows logical reading order |
| 2.4.4 | Link purpose (in context) | A | Link text describes destination (not "click here") |
| 2.4.6 | Headings and labels | AA | Headings/labels describe purpose |
| 2.4.7 | Focus visible | AA | Keyboard focus indicator is visible |
| 2.4.11 | Focus not obscured (minimum) | AA | Focused element not fully hidden by sticky headers/footers |
| 2.5.1 | Pointer gestures | A | Multi-point/path gestures have single-pointer alternatives |
| 2.5.2 | Pointer cancellation | A | Down-event doesn't trigger action (use click/up events) |
| 2.5.3 | Label in name | A | Visible label is part of accessible name |
| 2.5.4 | Motion actuation | A | Shake/tilt functions have button alternatives |
| 2.5.7 | Dragging movements | AA | Drag operations have non-drag alternatives |
| 2.5.8 | Target size (minimum) | AA | Touch targets at least 24x24px (44x44px recommended) |

### Understandable

| # | Criterion | Level | Key requirement |
|---|-----------|-------|-----------------|
| 3.1.1 | Language of page | A | `<html lang="en">` |
| 3.1.2 | Language of parts | AA | Mark up content in different languages |
| 3.2.1 | On focus | A | Focus alone doesn't trigger context change |
| 3.2.2 | On input | A | Changing a setting doesn't auto-submit without warning |
| 3.2.6 | Consistent help | A | Help links in same relative location across pages |
| 3.3.1 | Error identification | A | Errors described in text (not just color) |
| 3.3.2 | Labels or instructions | A | Form fields have labels |
| 3.3.3 | Error suggestion | AA | Suggest corrections for detected errors |
| 3.3.4 | Error prevention (legal/financial) | AA | Reversible/confirmed/reviewed submissions |
| 3.3.7 | Redundant entry | A | Don't ask for same info twice in a flow |
| 3.3.8 | Accessible authentication (minimum) | A | No cognitive test for login (allow paste, password managers) |

### Robust

| # | Criterion | Level | Key requirement |
|---|-----------|-------|-----------------|
| 4.1.2 | Name, role, value | A | Custom widgets expose name, role, state to AT |
| 4.1.3 | Status messages | AA | Status updates use `aria-live` (no focus move) |

---

## ARIA Roles Reference

### Landmark Roles

| Role | HTML equivalent | Purpose |
|------|-----------------|---------|
| `banner` | `<header>` (top-level) | Site header |
| `navigation` | `<nav>` | Navigation links |
| `main` | `<main>` | Primary content |
| `complementary` | `<aside>` | Supporting content |
| `contentinfo` | `<footer>` (top-level) | Site footer |
| `search` | `<search>` | Search functionality |
| `region` | `<section>` with label | Named landmark |
| `form` | `<form>` with label | Named form |

**Use HTML elements over ARIA roles.** `<nav>` is better than `<div role="navigation">`.

### Widget Roles

| Role | Expected keyboard | Required states/properties |
|------|-------------------|---------------------------|
| `button` | Enter, Space | — |
| `link` | Enter | `href` or `tabindex="0"` |
| `checkbox` | Space | `aria-checked` |
| `radio` | Arrows (within group) | `aria-checked` |
| `switch` | Space, Enter | `aria-checked` |
| `tab` | Arrows | `aria-selected`, `aria-controls` |
| `tabpanel` | — | `aria-labelledby` |
| `slider` | Arrows, Home, End | `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| `spinbutton` | Arrows, Home, End | `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| `combobox` | Arrows, Enter, Escape | `aria-expanded`, `aria-controls`, `aria-activedescendant` |
| `listbox` | Arrows, Home, End | — |
| `option` | — (parent handles) | `aria-selected` |
| `menu` | Arrows, Enter, Escape | — |
| `menuitem` | Enter | — |
| `menuitemcheckbox` | Space, Enter | `aria-checked` |
| `menuitemradio` | Space, Enter | `aria-checked` |
| `dialog` | Tab (trapped), Escape | `aria-modal`, `aria-labelledby` |
| `alertdialog` | Tab (trapped), Escape | `aria-modal`, `aria-labelledby` |
| `tree` | Arrows, Enter | `aria-expanded` (on treeitem) |
| `treeitem` | Enter, Arrows, Left/Right | `aria-expanded`, `aria-level` |
| `grid` | Arrows (2D), Enter | — |
| `gridcell` | — (parent handles) | — |
| `tooltip` | — (shown on hover/focus) | — |

### Live Region Roles

| Role/Attribute | Behavior |
|----------------|----------|
| `role="alert"` | Assertive announcement (interrupts) |
| `role="status"` | Polite announcement (waits for pause) |
| `role="log"` | Polite, append-only (chat, activity log) |
| `role="timer"` | Ticking updates (not announced by default) |
| `role="marquee"` | Auto-updating non-essential (stock ticker) |
| `aria-live="polite"` | Announce when user is idle |
| `aria-live="assertive"` | Announce immediately (use sparingly) |
| `aria-atomic="true"` | Read entire region, not just changed part |
| `aria-relevant` | What changes to announce: `additions`, `removals`, `text`, `all` |

---

## ARIA States and Properties

### Global States/Properties (valid on any element)

| Attribute | Values | Purpose |
|-----------|--------|---------|
| `aria-hidden` | `true`/`false` | Hide from assistive technology |
| `aria-disabled` | `true`/`false` | Disabled but still visible to AT |
| `aria-label` | string | Accessible name (when no visible text) |
| `aria-labelledby` | ID ref(s) | Accessible name from another element |
| `aria-describedby` | ID ref(s) | Additional description (hints, errors) |
| `aria-details` | ID ref | Detailed description element |
| `aria-live` | `off`/`polite`/`assertive` | Live region behavior |
| `aria-busy` | `true`/`false` | Region is updating (delay announcements) |
| `aria-current` | `page`/`step`/`location`/`date`/`time`/`true` | Current item in a set |
| `aria-keyshortcuts` | string | Document keyboard shortcut |
| `aria-roledescription` | string | Custom role description |
| `aria-invalid` | `true`/`false`/`grammar`/`spelling` | Validation state |
| `aria-errormessage` | ID ref | Error message element |
| `aria-haspopup` | `true`/`menu`/`listbox`/`tree`/`grid`/`dialog` | Popup type |

### Relationship Properties

| Attribute | Purpose |
|-----------|---------|
| `aria-controls` | Element this controls (tabs → panel, combobox → listbox) |
| `aria-owns` | Visual children that aren't DOM children |
| `aria-flowto` | Alternative reading order |
| `aria-activedescendant` | Currently active child (managed focus) |

### Widget-Specific

| Attribute | Used with | Purpose |
|-----------|-----------|---------|
| `aria-expanded` | button, combobox, treeitem | Expandable state |
| `aria-pressed` | button | Toggle button state |
| `aria-checked` | checkbox, radio, switch | Check state |
| `aria-selected` | tab, option, gridcell | Selection state |
| `aria-required` | input, combobox, select | Required field |
| `aria-readonly` | input, grid | Read-only state |
| `aria-multiselectable` | listbox, grid, tree | Multiple selection |
| `aria-orientation` | slider, listbox, menu | `horizontal`/`vertical` |
| `aria-valuemin/max/now/text` | slider, spinbutton | Value range |
| `aria-autocomplete` | combobox | `none`/`inline`/`list`/`both` |
| `aria-sort` | columnheader | `ascending`/`descending`/`none`/`other` |
| `aria-colcount/rowcount` | table, grid | Total columns/rows (when not all in DOM) |
| `aria-colindex/rowindex` | cell | Position in virtual table |
| `aria-colspan/rowspan` | cell | Spanning |
| `aria-posinset/setsize` | option, treeitem | Position in virtualized list |
| `aria-level` | heading, treeitem | Hierarchy depth |

---

## Screen Reader Behavior Guide

### How screen readers process content

1. **Virtual buffer** — SR builds a linearized view of the page from the accessibility tree
2. **Browse mode** — User navigates with SR shortcuts (H=headings, K=links, F=forms, T=tables)
3. **Focus/forms mode** — User interacts with form controls (arrow keys go to widget, not SR)
4. **Application mode** — `role="application"` disables SR shortcuts (almost never use this)

### What screen readers announce

| Element | Announcement pattern |
|---------|---------------------|
| Button | "{name}, button" |
| Link | "{name}, link" |
| Heading | "{name}, heading level {n}" |
| Image | "{alt text}, image" |
| Checkbox | "{name}, checkbox, {checked/not checked}" |
| Combobox | "{name}, combo box, {value}, {expanded/collapsed}" |
| Tab | "{name}, tab, {selected}, {n} of {total}" |
| Alert | "{content}" (announced immediately) |
| Live region (polite) | "{changed content}" (after current speech) |

### Testing with screen readers

| Platform | Screen reader | Quick test |
|----------|--------------|------------|
| macOS | VoiceOver | Cmd+F5 to toggle, Tab/arrows to navigate |
| Windows | NVDA (free) | Navigate with browse mode shortcuts |
| iOS | VoiceOver | Triple-click home/side button |
| Android | TalkBack | Settings > Accessibility |

**Minimum testing**: VoiceOver on macOS (what your team uses). Navigate every interactive flow with keyboard only, then with VoiceOver.

---

## Keyboard Interaction Patterns (detailed)

### Roving tabindex

For composite widgets (tabs, menus, toolbars) where arrows move within the group:

```tsx
/** Only one item is tabbable (tabIndex=0), rest are tabIndex=-1 */
/** Arrow keys move tabIndex=0 between items */
items.map((item, i) => (
  <div
    key={item.id}
    role="tab"
    tabIndex={i === activeIndex ? 0 : -1}
    onKeyDown={handleArrowKeys}
  >
    {item.label}
  </div>
))
```

React Aria handles this automatically for Tabs, Menu, ListBox, etc.

### aria-activedescendant

Alternative to roving tabindex — the container keeps focus, `aria-activedescendant` points to the "active" child:

```tsx
/** Container keeps focus, highlights child via aria-activedescendant */
<div
  role="listbox"
  tabIndex={0}
  aria-activedescendant={`option-${activeId}`}
  onKeyDown={handleArrowKeys}
>
  {items.map(item => (
    <div key={item.id} id={`option-${item.id}`} role="option" aria-selected={item.id === activeId}>
      {item.label}
    </div>
  ))}
</div>
```

Used by comboboxes, autocomplete, and virtualized lists.

### Focus management for SPAs

```tsx
/** After route change, move focus to heading */
useEffect(() => {
  const heading = document.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}, [pathname]);
```

### Escape key handling

Nested overlays should close innermost first. Each layer handles its own Escape:

```
Escape in dropdown inside modal → close dropdown
Escape again → close modal
```

HeroUI handles this via React Aria's `DismissButton` and overlay stacking.

---

## Accessible Color Design

### Contrast checking tools

- Chrome DevTools: Elements panel > Inspect element > contrast ratio shown in color picker
- Playwriter: `getStylesForLocator` to read computed colors, then calculate ratio
- Online: webaim.org/resources/contrastchecker

### Shipyard theme contrast notes

Navy backgrounds (#0a0e1a range) require light foreground text. Verify:
- `text-foreground` on `bg-background` meets 4.5:1
- `text-muted` on `bg-background` meets 4.5:1
- `text-foreground` on `bg-surface` meets 4.5:1
- Focus ring color on `bg-background` meets 3:1
- Accent color on `bg-background` meets 3:1 for UI components
