---
name: heroui-expert
description: "Expert at HeroUI v3 (beta) React components. Use when building UI with HeroUI components, theming, styling, or working with React Aria patterns. Covers compound components, onPress, Tailwind v4 integration, and all 56 available components."
---

# HeroUI v3 Expert

## Overview

HeroUI v3 is a React component library built on React Aria Components. Requires **Tailwind CSS v4** and **React 19+**. No Provider needed (unlike v2).

## Critical: v3 Differences from v2

- **Compound components**: `<Card><Card.Header>...</Card.Header></Card>` NOT `<Card title="...">`
- **onPress not onClick**: HeroUI Buttons use `onPress` for accessibility
- **No Provider**: Works directly without `<HeroUIProvider>`
- **Tailwind v4**: Uses `@theme` directive, not v3

## Setup

```css
/* globals.css — import order matters! */
@import "tailwindcss";
@import "@heroui/styles";
```

```html
<html class="light" data-theme="light">
  <body class="bg-background text-foreground">
```

## Most-Used Components

```tsx
// Button
<Button variant="primary" onPress={() => {}}>Save</Button>
<Button isIconOnly variant="ghost" size="sm" aria-label="Edit"><EditIcon /></Button>

// Card
<Card><Card.Header><Card.Title>Title</Card.Title></Card.Header><Card.Content>...</Card.Content></Card>

// Modal (three-level)
<Modal.Backdrop isOpen={open} onOpenChange={setOpen} isDismissable>
  <Modal.Container placement="center" size="sm">
    <Modal.Dialog><Modal.CloseTrigger />...</Modal.Dialog>
  </Modal.Container>
</Modal.Backdrop>

// TextField
<TextField isRequired><Label>Email</Label><Input type="email" /></TextField>

// Tabs
<Tabs><Tabs.List><Tabs.Tab id="a">A</Tabs.Tab></Tabs.List><Tabs.Panel id="a">...</Tabs.Panel></Tabs>

// Select
<Select><Label>Country</Label><Select.Trigger /><Select.Popover><Select.ListBox>
  <Select.Item id="us">US</Select.Item>
</Select.ListBox></Select.Popover></Select>

// Dropdown
<Dropdown><Button>Menu</Button><Dropdown.Popover><Dropdown.Menu selectionMode="single">
  <Dropdown.Item id="edit" textValue="Edit"><Label>Edit</Label></Dropdown.Item>
</Dropdown.Menu></Dropdown.Popover></Dropdown>

// Tooltip
<Tooltip><Tooltip.Trigger><Button>?</Button></Tooltip.Trigger><Tooltip.Content>Help</Tooltip.Content></Tooltip>

// Alert
<Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Title>Warning</Alert.Title></Alert.Content></Alert>

// Chip
<Chip size="sm" variant="soft" color="warning">Pending</Chip>
```

## All 56 Components

Accordion, Alert, AlertDialog, Autocomplete, Avatar, Breadcrumbs, Button, ButtonGroup, Card, Checkbox, CheckboxGroup, Chip, CloseButton, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, ComboBox, DateField, Description, Disclosure, DisclosureGroup, Dropdown, ErrorMessage, FieldError, Fieldset, Form, Input, InputGroup, InputOTP, Kbd, Label, Link, ListBox, Modal, NumberField, Popover, RadioGroup, ScrollShadow, SearchField, Select, Separator, Skeleton, Slider, Spinner, Surface, Switch, Tabs, TagGroup, TextArea, TextField, TimeField, Toast, Tooltip

## Further Reading

- [reference.md](./reference.md) — Full component API and theming
- [patterns.md](./patterns.md) — Shipyard-specific conventions and gotchas
- HeroUI MCP server available for up-to-date docs (use `mcp__heroui-react__*` tools)
