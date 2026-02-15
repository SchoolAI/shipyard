# Frontend Expert Memory

## flushSync Does NOT Flush Zustand/External Store Re-renders
- `flushSync` only guarantees React's own state updates (`useState`/`useReducer`) are flushed synchronously
- Zustand uses `useSyncExternalStore` which schedules re-renders separately
- When handing off from imperative DOM to React, use a settling phase (useEffect) instead of assuming flushSync catches external store updates
- This was the root cause of the resize panel snap-back bug

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
