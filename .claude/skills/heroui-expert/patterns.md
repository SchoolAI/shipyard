# HeroUI v3 — Shipyard Patterns

## Custom Color Palette

Shipyard uses a nautical-themed palette (in `apps/web/src/index.css`):
- **Accent**: Picton Blue `#42cde5` / `oklch(0.6439 0.1906 199.38)`
- **Neutrals**: Blue-tinted slate (Blue Bayoux `#4a5b74`, Geyser `#d6e1e0`)
- **Warning**: Orange Roughy `#cc5113`
- **Danger**: `#a51100`
- **AI indicator**: My Pink `#cb9380`

## Tailwind Config

Located at `apps/web/tailwind.config.ts` — extends colors with CSS variables, maps `background`, `foreground`, `surface`, `muted`, `border`.

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

`apps/web/src/components/ui/drawer.tsx` — builds slide-in drawer using Modal.Backdrop/Container/Dialog with CSS animations via data attributes.

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

- CSS + Theme: `apps/web/src/index.css`
- Tailwind Config: `apps/web/tailwind.config.ts`
- Drawer: `apps/web/src/components/ui/drawer.tsx`
- Sign-in Modal: `apps/web/src/components/sign-in-modal.tsx`
- Theme Toggle: `apps/web/src/components/theme-toggle.tsx`
- Sidebar: `apps/web/src/components/sidebar.tsx`

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
