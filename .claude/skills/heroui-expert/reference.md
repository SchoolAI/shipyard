# HeroUI v3 — Full Reference

## Theming

### Color System (oklch format)

Core semantic tokens:
- `--background` / `--foreground` — page bg/text
- `--surface` / `--surface-foreground` — card/panel bg
- `--overlay` / `--overlay-foreground` — modal/popover bg
- `--accent` / `--accent-foreground` — brand/primary
- `--success`, `--warning`, `--danger` + `-foreground` — status
- `--muted` — secondary text
- `--border`, `--focus`, `--link` — utility

### Overriding Colors
```css
:root { --accent: oklch(0.7 0.25 260); }
[data-theme="dark"], .dark { --accent: oklch(0.8 0.12 260); }
```

### Custom Colors
```css
:root { --info: oklch(0.6 0.15 210); --info-foreground: oklch(0.98 0 0); }
@theme inline { --color-info: var(--info); --color-info-foreground: var(--info-foreground); }
```

## Styling Approaches

1. **className** on any component: `<Button className="bg-purple-500">Custom</Button>`
2. **BEM classes** for global overrides: `.button { @apply font-semibold; }`
3. **tailwind-variants** for custom variant sets
4. **Data attributes**: `[data-hovered="true"]`, `[data-pressed="true"]`
5. **Render props**: `<Button className={({ isPressed }) => isPressed ? "bg-700" : "bg-500"}>`

## React Aria Event Handlers

| Handler | Components |
|---------|------------|
| `onPress` | Button (replaces onClick) |
| `onSelectionChange` | Select, ListBox, Dropdown, Tabs |
| `onOpenChange` | Modal, Popover, Dropdown, Tooltip |
| `onPressStart/End/Change` | Button granular lifecycle |
| `onHoverStart/End` | Hoverable components |
| `onFocus/Blur/FocusChange` | Focusable components |

## Component Quick Reference

### Button
Props: `variant` (primary/secondary/tertiary/outline/ghost/danger), `size` (sm/md/lg), `fullWidth`, `isDisabled`, `isPending`, `isIconOnly`, `onPress`

### Card
Parts: `Card`, `Card.Header`, `Card.Title`, `Card.Description`, `Card.Content`, `Card.Footer`
Variants: transparent, default, secondary, tertiary

### Modal
Parts: `Modal.Backdrop`, `Modal.Container`, `Modal.Dialog`, `Modal.CloseTrigger`
Props: `isOpen`, `onOpenChange`, `isDismissable`, `placement`, `size`

### TextField + Input
```tsx
<TextField isRequired><Label>Email</Label><Input type="email" value={v} onChange={fn} /></TextField>
```

### Tabs
```tsx
<Tabs defaultSelectedKey="a">
  <Tabs.List><Tabs.Tab id="a">A</Tabs.Tab></Tabs.List>
  <Tabs.Panel id="a">Content</Tabs.Panel>
</Tabs>
```

### Select
Parts: `Select`, `Select.Trigger`, `Select.Popover`, `Select.ListBox`, `Select.Item`

### Dropdown
Parts: `Dropdown`, `Dropdown.Popover`, `Dropdown.Menu`, `Dropdown.Item`, `Dropdown.ItemIndicator`
Props on Menu: `selectionMode`, `selectedKeys` (Set), `onSelectionChange`

### Alert
Parts: `Alert`, `Alert.Indicator`, `Alert.Content`, `Alert.Title`, `Alert.Description`
Props: `status` (default/accent/success/warning/danger)

### Avatar
```tsx
<Avatar className="size-8"><Avatar.Image src="..." alt="User" /><Avatar.Fallback>JD</Avatar.Fallback></Avatar>
```

### Checkbox / CheckboxGroup
```tsx
<CheckboxGroup><Label>Options</Label>
  <Checkbox name="opt1"><Label>Option 1</Label></Checkbox>
</CheckboxGroup>
```

### RadioGroup
```tsx
<RadioGroup><Label>Size</Label>
  <Radio value="sm"><Label>Small</Label></Radio>
</RadioGroup>
```

### Form
```tsx
<Form onSubmit={(e) => { e.preventDefault(); }}>
  <TextField isRequired><Label>Name</Label><Input /></TextField>
  <Button type="submit">Submit</Button>
</Form>
```

### Other Components
- **Switch**: `<Switch isSelected={v} onChange={fn}>Label</Switch>`
- **Chip**: `<Chip size="sm" variant="soft" color="warning">Text</Chip>`
- **Spinner**: `<Spinner size="sm" color="current" />`
- **Link**: `<Link href="...">Text<Link.Icon /></Link>`
- **Skeleton**: `<Skeleton className="h-4 w-32 rounded-md" />`
- **Separator**: `<Separator />`
- **Accordion**: Compound parts with `Accordion.Item`, `Accordion.Heading`, `Accordion.Trigger`, `Accordion.Panel`
- **Popover**: `<Popover><Popover.Trigger>...<Popover.Content>...</Popover.Content></Popover>`
