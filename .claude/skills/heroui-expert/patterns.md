# HeroUI v3 — Shipyard Patterns

## Custom Color Palette

Shipyard uses a nautical-themed palette derived from the logo. Defined in `apps/web/src/app.css`:

| Token | oklch | Source |
|---|---|---|
| **accent** | `oklch(0.65 0.16 45)` | Rust/copper cargo containers |
| **secondary** | `oklch(0.72 0.14 200)` | Teal/cyan ocean waves |
| **background** | `oklch(0.145 0.02 250)` | Deep navy ship hull |
| **surface** | `oklch(0.20 0.02 250)` | Lighter navy for cards |
| **default** | `oklch(0.27 0.02 250)` | Elevated bg (buttons, chips) |
| **muted** | `oklch(0.60 0.03 240)` | Steel-blue tower |
| **separator** | `oklch(0.25 0.02 250)` | Subtle navy borders |
| **success** | `oklch(0.72 0.19 150)` | Green |
| **warning** | `oklch(0.78 0.14 76)` | Amber |
| **danger** | `oklch(0.60 0.20 25)` | Red |

Custom Tailwind utilities (in `@theme` block):
- `hull` / `hull-light` -- dark/light steel-blue for active states
- `wave` / `wave-light` -- teal from logo, use for info/links
- `rust` / `rust-light` -- warm copper, same hue as accent

## Tailwind Config

Theme defined in `apps/web/src/app.css` using `@theme` directive (Tailwind v4). All semantic tokens mapped from HeroUI CSS variables to Tailwind utility classes.

## Modal Pattern

Always three-level compound:
```tsx
<Modal.Backdrop isOpen={isOpen} onOpenChange={setOpen} isDismissable>
  <Modal.Container placement="center" size="sm">
    <Modal.Dialog>
      <Modal.CloseTrigger />
      <Card>
        <Card.Header>...</Card.Header>
        <Card.Content>...</Card.Content>
      </Card>
    </Modal.Dialog>
  </Modal.Container>
</Modal.Backdrop>
```

## Drawer (Custom from Modal Primitives)

Path TBD (web app will be rebuilt) — builds slide-in drawer using Modal.Backdrop/Container/Dialog with CSS animations via data attributes.

## useOverlayState Hook

Import from `@heroui/react` for managing overlay (modal/drawer) state:

```tsx
import { useOverlayState } from '@heroui/react';

const drawerState = useOverlayState();
// drawerState.isOpen, drawerState.open(), drawerState.close(), drawerState.toggle()
```

## Tooltip + IconButton Pattern

```tsx
<Tooltip>
  <Tooltip.Trigger>
    <Button isIconOnly variant="ghost" size="sm" aria-label="Action">
      <Icon className="w-4 h-4" />
    </Button>
  </Tooltip.Trigger>
  <Tooltip.Content>Description</Tooltip.Content>
</Tooltip>
```

## Link with External Icon Pattern

```tsx
<Link href="..." target="_blank" className="text-sm text-accent hover:text-accent/80">
  Open task
  <Link.Icon className="ml-1 size-3">
    <ExternalLink />
  </Link.Icon>
</Link>
```

## Popover with Arrow Pattern

```tsx
<Popover>
  <Popover.Trigger>
    <Button>Open</Button>
  </Popover.Trigger>
  <Popover.Content placement="bottom end" className="w-80">
    <Popover.Dialog>
      <Popover.Arrow />
      <Popover.Heading>Title</Popover.Heading>
      {/* content */}
    </Popover.Dialog>
  </Popover.Content>
</Popover>
```

## Disclosure (Collapsible) Pattern

```tsx
<Disclosure>
  <Disclosure.Heading>
    <Disclosure.Trigger>
      <span>Section Title</span>
      <Disclosure.Indicator />
    </Disclosure.Trigger>
  </Disclosure.Heading>
  <Disclosure.Content>
    <Disclosure.Body>Content here</Disclosure.Body>
  </Disclosure.Content>
</Disclosure>
```

## Toasts

Shipyard uses **Sonner** (`import { toast } from 'sonner'`), NOT HeroUI's Toast component. Sonner variables themed via CSS in `index.css`.

## Icons

Uses **lucide-react** icons. Size pattern: `className="w-4 h-4"`.

## Key Files

- `apps/web/src/app.css` -- Theme variables + Tailwind `@theme` block
- `apps/web/index.html` -- `class="dark" data-theme="dark"` on `<html>`
- `apps/web/src/components/` -- All components use semantic tokens, zero hardcoded zinc/slate/gray

## v2 vs v3 Differences

| v2 | v3 |
|---|---|
| `<Card title="...">` | `<Card><Card.Header><Card.Title>...</Card.Title></Card.Header></Card>` |
| `variant="solid"/"bordered"/"flat"` | `variant="primary"/"secondary"/"tertiary"` |
| `onClick` on Button | `onPress` on Button |
| Requires `<HeroUIProvider>` | No provider needed |
| Framer Motion required | CSS animations built-in |
| Tailwind v3 | Tailwind v4 REQUIRED |

## Critical Gotchas

1. **CSS import order**: `@import "tailwindcss"` MUST come before `@import "@heroui/styles"`
2. **onPress not onClick**: `onClick` on HeroUI Button silently fails for keyboard/accessibility
3. **No Badge component**: Use Chip instead
4. **Tailwind v4 required**: `@theme` directive is v4-only
5. **Compound components NOT optional**: Cannot pass `title` as prop to Card
6. **React 19 required**
7. **Both class AND data-theme**: Set `class="dark"` AND `data-theme="dark"` on `<html>`
8. **oklch colors**: All theme colors use oklch. Use https://oklch.com for conversion
9. **Render props for loading**: `<Button isPending>{({isPending}) => isPending ? "Loading..." : "Submit"}</Button>`
10. **SelectionMode required**: Dropdown.Menu and ListBox need `selectionMode` prop, use `Set` for selectedKeys
11. **textValue required**: On Dropdown.Item with complex children, always provide `textValue`
12. **Modal is three-level**: `Backdrop > Container > Dialog`, not a single `<Modal>`
13. **useOverlayState**: Import from `@heroui/react` for managing modal/popover state
14. **Beta status**: v3.0.0-beta.6, API may change before stable
