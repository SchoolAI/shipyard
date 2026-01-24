# HeroUI v3 Component Availability

**Version Tested:** `@heroui/react@3.0.0-beta.3`

**Date:** 2026-01-24

## Summary

All requested input components are available in HeroUI v3.0.0-beta.3 and can be imported directly from `@heroui/react`.

## Component Availability

| Component | Available? | Import Path | Notes |
|-----------|-----------|-------------|-------|
| NumberField | Yes | `@heroui/react` | Compound component with Group, Input, IncrementButton, DecrementButton |
| DateField | Yes | `@heroui/react` | Uses `@internationalized/date` for DateValue types |
| TimeField | Yes | `@heroui/react` | Uses `@internationalized/date` for TimeValue types |
| Select | Yes | `@heroui/react` | Compound component with Trigger, Value, Indicator, Popover |
| Slider | Yes | `@heroui/react` | Compound component with Output, Track, Fill, Thumb, Marks |

## Component APIs

### NumberField

Built on React Aria's NumberField primitive. Uses compound component pattern.

```tsx
import { NumberField } from '@heroui/react';

<NumberField minValue={0} maxValue={100} defaultValue={50}>
  <NumberField.Group>
    <NumberField.DecrementButton>-</NumberField.DecrementButton>
    <NumberField.Input />
    <NumberField.IncrementButton>+</NumberField.IncrementButton>
  </NumberField.Group>
</NumberField>
```

**Key Props:**
- `minValue`, `maxValue`, `step` - Numeric constraints
- `value`, `defaultValue`, `onChange` - Controlled/uncontrolled value
- `isDisabled`, `isReadOnly` - State flags
- `fullWidth`, `isOnSurface` - Styling variants

### DateField

Built on React Aria's DateField primitive. Simple wrapper component.

```tsx
import { DateField } from '@heroui/react';
import { parseDate } from '@internationalized/date';

<DateField
  label="Birthday"
  defaultValue={parseDate('2024-01-15')}
/>
```

**Key Props:**
- `value`, `defaultValue`, `onChange` - Date value (uses `DateValue` type from `@internationalized/date`)
- `minValue`, `maxValue` - Date constraints
- `granularity` - 'day' | 'hour' | 'minute' | 'second'
- `fullWidth` - Styling variant

**Dependency:** Requires `@internationalized/date` for date values (already included in HeroUI dependencies).

### TimeField

Built on React Aria's TimeField primitive. Simple wrapper component.

```tsx
import { TimeField } from '@heroui/react';
import { parseTime } from '@internationalized/date';

<TimeField
  label="Meeting Time"
  defaultValue={parseTime('14:30')}
/>
```

**Key Props:**
- `value`, `defaultValue`, `onChange` - Time value (uses `TimeValue` type from `@internationalized/date`)
- `granularity` - 'hour' | 'minute' | 'second'
- `hourCycle` - 12 | 24
- `fullWidth` - Styling variant

**Dependency:** Requires `@internationalized/date` for time values (already included in HeroUI dependencies).

### Select

Built on React Aria's Select primitive. Uses compound component pattern with ListBox for items.

```tsx
import { Select, ListBox, ListBoxItem } from '@heroui/react';

<Select>
  <Select.Trigger>
    <Select.Value placeholder="Select an option" />
    <Select.Indicator />
  </Select.Trigger>
  <Select.Popover>
    <ListBox>
      <ListBoxItem id="option1">Option 1</ListBoxItem>
      <ListBoxItem id="option2">Option 2</ListBoxItem>
    </ListBox>
  </Select.Popover>
</Select>
```

**Key Props:**
- `selectedKey`, `defaultSelectedKey`, `onSelectionChange` - Single selection
- `selectionMode` - 'single' | 'multiple'
- `items` - Collection items for dynamic rendering
- `fullWidth`, `isOnSurface` - Styling variants

**Note:** Use `ListBox` and `ListBoxItem` (camelCase), not `Listbox`/`ListboxItem`.

### Slider

Built on React Aria's Slider primitive. Uses compound component pattern.

```tsx
import { Slider } from '@heroui/react';

<Slider defaultValue={50} minValue={0} maxValue={100}>
  <Slider.Output />
  <Slider.Track>
    <Slider.Fill />
    <Slider.Thumb />
  </Slider.Track>
</Slider>
```

**Key Props:**
- `value`, `defaultValue`, `onChange` - Numeric value
- `minValue`, `maxValue`, `step` - Constraints
- `orientation` - 'horizontal' | 'vertical'
- Supports multiple thumbs for range selection

**Sub-components:**
- `Slider.Output` - Displays current value
- `Slider.Track` - Clickable track area
- `Slider.Fill` - Filled portion of track
- `Slider.Thumb` - Draggable handle
- `Slider.Marks` - Tick marks on track

## Additional Components Available

While researching, these related components were also confirmed available:

| Component | Purpose |
|-----------|---------|
| ListBox | List selection (used inside Select) |
| ListBoxItem | Individual list item |
| ListBoxSection | Grouped list items |
| Calendar | Full calendar picker |
| DateInputGroup | Grouped date inputs |
| ComboBox | Searchable dropdown |

## Integration Notes

1. **React Aria Foundation**: All components are built on `react-aria-components` which provides:
   - Full accessibility (WCAG 2.1 AA compliant)
   - Keyboard navigation
   - Touch-friendly interactions
   - Internationalization support

2. **Compound Component Pattern**: Most components use the `Component.SubComponent` pattern. This is consistent with HeroUI v3's design philosophy.

3. **Date/Time Dependencies**: DateField and TimeField require date values from `@internationalized/date`. This package is already a dependency of `@heroui/react`, so no additional installation is needed.

4. **Styling**: All components support the standard HeroUI styling props and can be customized via Tailwind CSS classes.

## Fallback Plan (Not Needed)

Since all components are available, no fallbacks are required. However, if issues arise with the beta components:

| Component | HTML5 Fallback |
|-----------|---------------|
| NumberField | `<input type="number">` with manual styling |
| DateField | `<input type="date">` with manual styling |
| TimeField | `<input type="time">` with manual styling |
| Select | Existing ComboBox component (confirmed working) |
| Slider | `<input type="range">` with manual styling |

## Verification Method

Components were verified by:
1. Examining `node_modules/@heroui/react/dist/components/` directory structure
2. Reading TypeScript declaration files for each component
3. Creating a test file with all imports and running `pnpm tsc --noEmit`
4. Confirmed zero TypeScript errors for the test imports

---

*Generated by Claude Code verification process*
