# Frontend Expert Memory

## HeroUI v3 Tooltip API
- `placement` prop goes on `Tooltip.Content`, NOT on the `Tooltip` root component
- This differs from how `Popover.Content` and `Modal.Container` handle placement
- The `Tooltip` root itself accepts no props besides children

## Zustand Store Patterns in Shipyard
- Always use selectors: `useTaskStore(s => s.tasks)` not `useTaskStore()`
- For mutations outside React components, use `useStore.getState().action()`
- UIStore is persisted to localStorage (sidebar expand state)

## Biome Formatting
- Destructured function parameters with 3+ items must be multi-line
- Run `pnpm biome check <file>` to verify individual files
