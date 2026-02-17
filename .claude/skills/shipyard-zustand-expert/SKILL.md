---
name: shipyard-zustand-expert
description: "Expert at Zustand state management for React/vanilla JS. Use when creating stores, managing client-side state, persisting to IndexedDB/localStorage, optimizing re-renders with selectors, composing middleware, typing stores with TypeScript, testing stores with Vitest, or choosing between global vs scoped store patterns."
---

# Zustand Expert

## Overview

Zustand v5 is a small, fast, scalable state management library for React. It uses hooks, requires no providers, no boilerplate, and handles the zombie child problem, React concurrency, and context loss correctly. Built on `useSyncExternalStore` for React 18+ compatibility.

## Mental Model

- **A store is a hook.** `create()` returns a React hook with `.setState`, `.getState`, `.subscribe`, `.getInitialState` attached.
- **`set` does shallow merge** by default (one level). Pass `true` as second arg to replace entirely.
- **Selectors control re-renders.** Components only re-render when the selected slice changes (via `Object.is`).
- **No providers needed.** Stores are module-level singletons. Use Context only for scoped/per-request stores (SSR, Next.js).
- **Vanilla stores exist too.** `createStore()` from `zustand/vanilla` works outside React.

## Quick Start

```ts
import { create } from 'zustand'

interface BearState {
  bears: number
  increase: (by: number) => void
}

const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
}))

// In components — always use selectors
const bears = useBearStore((state) => state.bears)
const increase = useBearStore((state) => state.increase)
```

## When to Use Which Pattern

| Scenario | Pattern |
|----------|---------|
| Simple app state | Single `create()` store |
| Large store, many domains | Slices pattern (split into creator functions) |
| Deep nested updates | `immer` middleware |
| Persist to localStorage/IndexedDB | `persist` middleware |
| Debug state changes | `devtools` middleware |
| Subscribe to specific slices outside React | `subscribeWithSelector` middleware |
| Multiple instances of same store | `createStore()` + React Context |
| Next.js / SSR | `createStore()` + Context provider per request |
| Infer types without annotation | `combine` middleware |
| Multiple values from selector without extra re-renders | `useShallow` hook |

## Critical TypeScript Pattern

Always use the **curried form** with explicit type annotation:

```ts
// CORRECT — curried form
const useStore = create<MyState>()((set) => ({ ... }))

// WRONG — type inference fails for invariant generics
const useStore = create((set) => ({ ... }))
```

The extra `()` is a workaround for TypeScript's inability to infer invariant generics (the state type appears in both covariant and contravariant positions).

## Common Gotchas

1. **Selector returns new reference every render** -- wrap with `useShallow` or memoize
2. **Mutating state directly** -- always return new objects from `set()`
3. **Calling `get()` during store creation** -- returns `undefined`, only call `get()` inside actions
4. **Nested objects need manual spreading** -- `set` only merges one level deep
5. **Map/Set must create new instances** -- `new Map(state.foo).set(k, v)`, not `state.foo.set(k, v)`
6. **Middleware order matters** -- `devtools` should be outermost, `immer` innermost

## Further Reading

- [reference.md](./reference.md) -- Full API, middleware, TypeScript, testing, and patterns
