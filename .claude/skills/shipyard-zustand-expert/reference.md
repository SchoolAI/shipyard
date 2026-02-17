# Zustand Reference

Comprehensive reference for Zustand v5 state management. Covers every API, middleware, TypeScript pattern, testing strategy, and advanced usage.

---

## Table of Contents

1. [Core API](#1-core-api)
2. [Selectors and Re-render Optimization](#2-selectors-and-re-render-optimization)
3. [Updating State](#3-updating-state)
4. [Middleware](#4-middleware)
5. [TypeScript](#5-typescript)
6. [Slices Pattern](#6-slices-pattern)
7. [Scoped Stores with Context](#7-scoped-stores-with-context)
8. [Persist Middleware (Deep Dive)](#8-persist-middleware-deep-dive)
9. [Testing](#9-testing)
10. [Next.js / SSR](#10-nextjs--ssr)
11. [Patterns and Recipes](#11-patterns-and-recipes)
12. [Anti-patterns](#12-anti-patterns)
13. [Comparison with Other Libraries](#13-comparison-with-other-libraries)

---

## 1. Core API

### `create` (React hook store)

```ts
import { create } from 'zustand'

// Signature
create<T>()(stateCreatorFn: StateCreator<T, [], []>): UseBoundStore<StoreApi<T>>
```

The `stateCreatorFn` receives three arguments:
- `set` -- update state (shallow merge by default)
- `get` -- read current state
- `store` -- the store API object itself

Returns a React hook with attached API utilities: `setState`, `getState`, `getInitialState`, `subscribe`.

```ts
const useCountStore = create<CountState>()((set, get, store) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  getDouble: () => get().count * 2,
  reset: () => set(store.getInitialState()),
}))

// Using the hook in React
const count = useCountStore((state) => state.count)

// Using outside React
useCountStore.getState().increment()
useCountStore.subscribe((state) => console.log(state))
```

### `createStore` (Vanilla store, no React)

```ts
import { createStore } from 'zustand/vanilla'

// Signature
createStore<T>()(stateCreatorFn: StateCreator<T, [], []>): StoreApi<T>
```

Returns a plain store object (not a hook). Use with `useStore` hook in React.

```ts
const counterStore = createStore<CounterStore>()((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))

// Vanilla usage
counterStore.getState().increment()
counterStore.subscribe((state) => console.log(state))

// React usage
import { useStore } from 'zustand'
const count = useStore(counterStore, (state) => state.count)
```

### `useStore` hook

```ts
import { useStore } from 'zustand'

// Signature
useStore<StoreApi<T>, U = T>(store: StoreApi<T>, selectorFn?: (state: T) => U): U
```

Connects a vanilla store (`createStore`) to React. Required for Context-based patterns.

### Store API Methods

Every store (both `create` and `createStore`) exposes:

| Method | Description |
|--------|-------------|
| `getState()` | Returns current state synchronously |
| `setState(partial, replace?)` | Updates state. Shallow merge by default. Pass `true` for full replace. |
| `subscribe(listener)` | Register callback `(state, prevState) => void`. Returns unsubscribe function. |
| `getInitialState()` | Returns the state as it was when the store was created |

---

## 2. Selectors and Re-render Optimization

### Basic Selectors

Components re-render only when the selected value changes (compared with `Object.is`).

```ts
// GOOD -- fine-grained selector, minimal re-renders
const bears = useStore((s) => s.bears)
const increment = useStore((s) => s.increment)

// BAD -- selects entire state, re-renders on any change
const state = useStore()
const { bears, increment } = useStore((s) => s)
```

### `useShallow` -- Prevent Re-renders from New References

When a selector returns a new object/array every time, use `useShallow` for shallow comparison:

```ts
import { useShallow } from 'zustand/react/shallow'

// Without useShallow: re-renders every time ANY state changes (Object.keys creates new array)
const names = useStore((state) => Object.keys(state))

// With useShallow: only re-renders when the array contents actually change
const names = useStore(useShallow((state) => Object.keys(state)))

// Selecting multiple fields as an object
const { bears, food } = useStore(
  useShallow((state) => ({ bears: state.bears, food: state.food }))
)
```

### `shallow` utility (for manual comparison)

```ts
import { shallow } from 'zustand/shallow'

// Compares top-level properties only
shallow({ a: 1, b: 2 }, { a: 1, b: 2 })  // true
shallow({ a: { x: 1 } }, { a: { x: 1 } })  // false (different nested reference)

// Also works with Sets and Maps at top level
shallow(new Set([1, 2]), new Set([1, 2]))  // true
shallow(new Map([['a', 1]]), new Map([['a', 1]]))  // true
```

### `createWithEqualityFn` -- Store-level Equality

```ts
import { createWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/vanilla/shallow'

const useStore = createWithEqualityFn<MyState>()(
  (set) => ({ ... }),
  shallow  // applied to all selectors by default
)
```

### `useStoreWithEqualityFn` -- Per-call Equality

```ts
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { shallow } from 'zustand/shallow'

const position = useStoreWithEqualityFn(store, (s) => s.position, shallow)
```

### Auto-generating Selectors

Generate `.use.fieldName()` hooks automatically:

```ts
import { StoreApi, UseBoundStore } from 'zustand'

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never

const createSelectors = <S extends UseBoundStore<StoreApi<object>>>(_store: S) => {
  const store = _store as WithSelectors<typeof _store>
  store.use = {}
  for (const k of Object.keys(store.getState())) {
    ;(store.use as any)[k] = () => store((s) => s[k as keyof typeof s])
  }
  return store
}

// Usage
const useBearStore = createSelectors(useBearStoreBase)
const bears = useBearStore.use.bears()
const increment = useBearStore.use.increment()
```

### Derived State with Selectors

Compute values without storing them:

```ts
const totalFood = useStore((s) => s.bears * s.foodPerBear)
```

---

## 3. Updating State

### Flat Updates (Shallow Merge)

```ts
set({ count: 5 })
set((state) => ({ count: state.count + 1 }))
```

### Replace Entire State

```ts
set(newState, true)  // second arg = replace flag
```

### Nested Object Updates

`set` only merges one level. For nested objects, spread manually:

```ts
set((state) => ({
  nested: { ...state.nested, count: state.nested.count + 1 },
}))

// For deeply nested:
set((state) => ({
  deep: {
    ...state.deep,
    nested: {
      ...state.deep.nested,
      obj: { ...state.deep.nested.obj, count: state.deep.nested.obj.count + 1 },
    },
  },
}))
```

Or use the `immer` middleware (see section 4).

### Map and Set Updates

Always create new instances -- mutating in place does not trigger re-renders:

```ts
// Map -- add/update entry
set((state) => ({ myMap: new Map(state.myMap).set(key, value) }))

// Map -- delete entry
set((state) => {
  const next = new Map(state.myMap)
  next.delete(key)
  return { myMap: next }
})

// Set -- add item
set((state) => ({ mySet: new Set(state.mySet).add(item) }))

// Set -- delete item
set((state) => {
  const next = new Set(state.mySet)
  next.delete(item)
  return { mySet: next }
})
```

Type hint for empty collections:
```ts
{
  ids: new Set([] as string[]),
  users: new Map([] as [string, User][]),
}
```

### Subscribing to State Outside React

```ts
const unsub = useStore.subscribe((state) => {
  console.log('State changed:', state)
})

// With subscribeWithSelector middleware:
const unsub = useStore.subscribe(
  (state) => state.count,
  (count) => console.log('Count is now:', count)
)
```

### External Actions (No Store Actions Pattern)

```ts
const useStore = create<State>()(() => ({
  count: 0,
  text: 'hello',
}))

// Actions defined at module level, outside the store
export const inc = () => useStore.setState((s) => ({ count: s.count + 1 }))
export const setText = (text: string) => useStore.setState({ text })
```

Advantages: no hook needed to call actions; facilitates code splitting.

---

## 4. Middleware

### Middleware Composition Order

```ts
// RECOMMENDED ORDER (outermost to innermost):
create<MyState>()(
  devtools(          // outermost -- must be last to see all state changes
    persist(         // middle
      immer(         // innermost -- mutates set() before others see it
        (set) => ({ ... })
      ),
      { name: 'storage-key' }
    )
  )
)
```

**Rule: `devtools` should always be outermost.** It mutates `setState` and adds a type parameter. If other middleware (like `immer`) mutates `setState` after `devtools`, the type parameter can be lost.

### `immer` Middleware

Enables mutable-style updates that produce immutable state. Requires `immer` package.

```ts
import { immer } from 'zustand/middleware/immer'

const useStore = create<State>()(
  immer((set) => ({
    person: { firstName: 'Barbara', lastName: 'Hepworth', email: 'b@h.com' },
    updateFirstName: (firstName: string) =>
      set((state) => {
        state.person.firstName = firstName  // looks like mutation, but Immer handles it
      }),
  }))
)
```

**Immer gotchas:**
- Must add `[immerable] = true` for class objects
- If Immer mutates without creating a proxy, Zustand sees no change and skips subscriber notifications

### `persist` Middleware

Persists store state across page reloads. See [section 8](#8-persist-middleware-deep-dive) for full deep dive.

```ts
import { persist, createJSONStorage } from 'zustand/middleware'

const useStore = create<State>()(
  persist(
    (set) => ({ bears: 0, addBear: () => set((s) => ({ bears: s.bears + 1 })) }),
    {
      name: 'bears-storage',                         // localStorage key (required, must be unique)
      storage: createJSONStorage(() => localStorage), // default
    }
  )
)
```

### `devtools` Middleware

Connects to Redux DevTools Extension. Requires `@redux-devtools/extension` package.

```ts
import { devtools } from 'zustand/middleware'

const useStore = create<State>()(
  devtools(
    (set) => ({
      bears: 0,
      addBear: () => set(
        (state) => ({ bears: state.bears + 1 }),
        undefined,       // replace flag (keep undefined for default behavior)
        'bears/addBear'  // action name shown in DevTools
      ),
    }),
    {
      name: 'BearStore',       // connection name in DevTools
      enabled: true,           // defaults to true in dev, false in prod
      store: 'bears',          // store identifier when using multiple stores
      anonymousActionType: 'unknown',  // default name for unlabeled actions
    }
  )
)
```

**Set with devtools action names:**
```ts
set(nextState, undefined, 'actionName')  // 3rd arg to set() is the action type
```

**Cleanup (for dynamic stores):**
```ts
useStore.devtools.cleanup()
```

### `subscribeWithSelector` Middleware

Enables subscribing to specific slices of state outside React:

```ts
import { subscribeWithSelector } from 'zustand/middleware'

const useStore = create<State>()(
  subscribeWithSelector((set) => ({
    position: { x: 0, y: 0 },
    setPosition: (pos) => set({ position: pos }),
  }))
)

// Subscribe to just position.x
useStore.subscribe(
  (state) => state.position.x,
  (x) => console.log('x changed to', x)
)
```

### `combine` Middleware

Separates initial state from actions. Automatically infers types -- no explicit type annotation needed.

```ts
import { combine } from 'zustand/middleware'

const useStore = create(
  combine(
    { bears: 0 },  // initial state (types inferred)
    (set) => ({     // actions
      increase: (by: number) => set((s) => ({ bears: s.bears + by })),
    })
  )
)
```

**Caveat:** `set`, `get`, `store` in the second function are typed as if state is only the first parameter. At runtime they include both state and actions, but TypeScript sees only the initial state type for these callbacks.

### `redux` Middleware

Full reducer/dispatch pattern:

```ts
import { redux } from 'zustand/middleware'

type Action =
  | { type: 'INCREMENT'; qty: number }
  | { type: 'DECREMENT'; qty: number }

const reducer = (state: State, action: Action) => {
  switch (action.type) {
    case 'INCREMENT': return { count: state.count + action.qty }
    case 'DECREMENT': return { count: state.count - action.qty }
    default: return state
  }
}

const useStore = create<State & { dispatch: (a: Action) => Action }>()(
  redux(reducer, { count: 0 })
)

useStore.getState().dispatch({ type: 'INCREMENT', qty: 5 })
```

---

## 5. TypeScript

### Basic Store Typing

Always use the curried form:

```ts
interface BearState {
  bears: number
  increase: (by: number) => void
}

const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  increase: (by) => set((state) => ({ bears: state.bears + by })),
}))
```

### Why Curried `create<T>()()`?

TypeScript cannot infer `T` when it appears in both covariant and contravariant positions (via `set` and `get`). The extra `()` is a workaround for [microsoft/TypeScript#10571](https://github.com/microsoft/TypeScript/issues/10571) -- it lets you annotate the state type while still inferring other generics.

### Extracting Store Types

```ts
import { create, type ExtractState } from 'zustand'

const useStore = create<MyState>()(...)

// Extract the full state type
type MyStoreState = ExtractState<typeof useStore>
```

### Middleware with TypeScript

Middleware composes cleanly -- just nest them inside `create<T>()()`:

```ts
const useStore = create<BearState>()(
  devtools(
    persist(
      (set) => ({
        bears: 0,
        increase: (by) => set((state) => ({ bears: state.bears + by })),
      }),
      { name: 'bearStore' }
    )
  )
)
```

### Middleware Mutator Types

When using `StateCreator` for slices with middleware:

| Middleware | Mutator Type |
|-----------|-------------|
| `devtools` | `['zustand/devtools', never]` |
| `persist` | `['zustand/persist', YourPersistedState]` |
| `immer` | `['zustand/immer', never]` |
| `subscribeWithSelector` | `['zustand/subscribeWithSelector', never]` |
| `redux` | `['zustand/redux', YourAction]` |
| `combine` | no mutator (doesn't mutate the store) |

### Slices with Middleware TypeScript

```ts
const createBearSlice: StateCreator<
  JungleStore,                        // full combined store type
  [['zustand/devtools', never]],      // middleware mutators
  [],                                 // no additional mutators
  BearSlice                           // this slice's type
> = (set) => ({
  bears: 0,
  addBear: () => set(
    (state) => ({ bears: state.bears + 1 }),
    undefined,
    'bear/addBear'
  ),
})
```

### Custom Middleware TypeScript (Does Not Change Store)

```ts
import { create, StateCreator, StoreMutatorIdentifier } from 'zustand'

type Logger = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string,
) => StateCreator<T, Mps, Mcs>

type LoggerImpl = <T>(
  f: StateCreator<T, [], []>,
  name?: string,
) => StateCreator<T, [], []>

const loggerImpl: LoggerImpl = (f, name) => (set, get, store) => {
  const loggedSet: typeof set = (...a) => {
    set(...(a as Parameters<typeof set>))
    console.log(...(name ? [`${name}:`] : []), get())
  }
  const setState = store.setState
  store.setState = (...a) => {
    setState(...(a as Parameters<typeof setState>))
    console.log(...(name ? [`${name}:`] : []), store.getState())
  }
  return f(loggedSet, get, store)
}

export const logger = loggerImpl as unknown as Logger
```

---

## 6. Slices Pattern

Split a large store into smaller, composable slice creator functions:

```ts
// bearSlice.ts
export const createBearSlice: StateCreator<BearSlice & FishSlice, [], [], BearSlice> = (set) => ({
  bears: 0,
  addBear: () => set((state) => ({ bears: state.bears + 1 })),
  eatFish: () => set((state) => ({ fishes: state.fishes - 1 })),  // cross-slice access
})

// fishSlice.ts
export const createFishSlice: StateCreator<BearSlice & FishSlice, [], [], FishSlice> = (set) => ({
  fishes: 0,
  addFish: () => set((state) => ({ fishes: state.fishes + 1 })),
})

// store.ts -- combine
const useBoundStore = create<BearSlice & FishSlice>()((...a) => ({
  ...createBearSlice(...a),
  ...createFishSlice(...a),
}))
```

### Cross-slice Actions

Use `get()` to call actions from other slices:

```ts
const createSharedSlice: StateCreator<
  BearSlice & FishSlice, [], [], SharedSlice
> = (set, get) => ({
  addBoth: () => {
    get().addBear()
    get().addFish()
  },
  getBoth: () => get().bears + get().fishes,
})
```

### Slices with Middleware

Apply middleware **only to the combined store**, not individual slices:

```ts
const useBoundStore = create<BearSlice & FishSlice>()(
  persist(
    (...a) => ({
      ...createBearSlice(...a),
      ...createFishSlice(...a),
    }),
    { name: 'bound-store' }
  )
)
```

---

## 7. Scoped Stores with Context

For per-component-instance or per-request stores (SSR, testing, multiple instances):

```ts
import { type ReactNode, createContext, useContext, useState } from 'react'
import { createStore, useStore } from 'zustand'

// 1. Define store factory
interface BearProps { bears: number }
interface BearState extends BearProps { addBear: () => void }

const createBearStore = (initProps?: Partial<BearProps>) => {
  return createStore<BearState>()((set) => ({
    bears: 0,
    ...initProps,
    addBear: () => set((state) => ({ bears: state.bears + 1 })),
  }))
}

// 2. Create context
type BearStoreApi = ReturnType<typeof createBearStore>
const BearContext = createContext<BearStoreApi | null>(null)

// 3. Provider (creates store once via useState initializer)
function BearProvider({ children, ...props }: React.PropsWithChildren<BearProps>) {
  const [store] = useState(() => createBearStore(props))
  return <BearContext.Provider value={store}>{children}</BearContext.Provider>
}

// 4. Custom hook (mimics the hook returned by create())
function useBearContext<T>(selector: (state: BearState) => T): T {
  const store = useContext(BearContext)
  if (!store) throw new Error('Missing BearContext.Provider in the tree')
  return useStore(store, selector)
}

// 5. Usage -- each provider instance has independent state
<BearProvider bears={3}><BearCounter /></BearProvider>
<BearProvider bears={7}><BearCounter /></BearProvider>
```

---

## 8. Persist Middleware (Deep Dive)

### Basic Persistence

```ts
import { persist, createJSONStorage } from 'zustand/middleware'

const useStore = create<MyState>()(
  persist(
    (set, get) => ({ ... }),
    {
      name: 'my-storage-key',  // required, unique per store
    }
  )
)
```

### All Persist Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | (required) | Unique key in storage |
| `storage` | `PersistStorage` | `createJSONStorage(() => localStorage)` | Storage engine |
| `partialize` | `(state) => Partial<State>` | `(state) => state` | Filter which fields to persist |
| `onRehydrateStorage` | `(state) => ((state?, error?) => void) \| void` | -- | Lifecycle hook for hydration |
| `version` | `number` | `0` | Schema version number |
| `migrate` | `(persisted, version) => State` | identity | Migration function between versions |
| `merge` | `(persisted, current) => State` | shallow merge | Custom merge during rehydration |
| `skipHydration` | `boolean` | `false` | Skip auto-hydration (call `rehydrate()` manually) |

### Custom Storage (IndexedDB example with idb-keyval)

```ts
import { get, set, del } from 'idb-keyval'
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware'

const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value)
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name)
  },
}

const useStore = create<State>()(
  persist(
    (set) => ({ ... }),
    {
      name: 'my-idb-store',
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
)
```

### Partial Persistence

Only persist selected fields:

```ts
persist(
  (set) => ({ foo: 0, bar: 1, secret: 'hidden' }),
  {
    name: 'store',
    partialize: (state) => ({ foo: state.foo, bar: state.bar }),  // secret is not persisted
  }
)
```

### Versioned Migrations

```ts
persist(
  (set) => ({
    position: { x: 0, y: 0 },  // v1 schema
    setPosition: (pos) => set({ position: pos }),
  }),
  {
    name: 'position',
    version: 1,
    migrate: (persisted: any, version) => {
      if (version === 0) {
        // v0 had flat { x, y } -- migrate to { position: { x, y } }
        persisted.position = { x: persisted.x, y: persisted.y }
        delete persisted.x
        delete persisted.y
      }
      return persisted
    },
  }
)
```

### Deep Merge for Nested State

Default merge is shallow. Use deep merge when persisted state has missing nested fields:

```ts
import createDeepMerge from '@fastify/deepmerge'
const deepMerge = createDeepMerge({ all: true })

persist(
  (set) => ({ ... }),
  {
    name: 'store',
    merge: (persisted, current) => deepMerge(current, persisted) as never,
  }
)
```

### Manual Hydration (SSR)

```ts
persist(
  (set) => ({ ... }),
  {
    name: 'store',
    skipHydration: true,
  }
)

// Later, in a useEffect or after conditions are met:
useStore.persist.rehydrate()
```

### Persist API

```ts
useStore.persist.getOptions()       // current persist options
useStore.persist.setOptions(opts)   // change options at runtime
useStore.persist.clearStorage()     // remove persisted data
useStore.persist.rehydrate()        // manually trigger rehydration
useStore.persist.hasHydrated()      // non-reactive check if hydrated
useStore.persist.onHydrate(fn)      // listener for hydration start
useStore.persist.onFinishHydration(fn)  // listener for hydration end
```

### Hydration-aware Component

```ts
const useHydration = () => {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const unsubHydrate = useStore.persist.onHydrate(() => setHydrated(false))
    const unsubFinish = useStore.persist.onFinishHydration(() => setHydrated(true))
    setHydrated(useStore.persist.hasHydrated())
    return () => { unsubHydrate(); unsubFinish() }
  }, [])
  return hydrated
}
```

### Async Storage Caveat

With async storage (IndexedDB, AsyncStorage), hydration happens in a microtask -- the store is NOT hydrated at initial render. Components may briefly show default state. Use `hasHydrated()` or `onFinishHydration()` to gate rendering.

### Custom Serialization (Superjson, for Map/Set/Date)

```ts
import superjson from 'superjson'
import { PersistStorage } from 'zustand/middleware'

const storage: PersistStorage<MyState> = {
  getItem: (name) => {
    const str = localStorage.getItem(name)
    if (!str) return null
    return superjson.parse(str)
  },
  setItem: (name, value) => {
    localStorage.setItem(name, superjson.stringify(value))
  },
  removeItem: (name) => localStorage.removeItem(name),
}
```

### Rehydrate on Storage Events (Cross-tab Sync)

```ts
import { Mutate, StoreApi } from 'zustand'

type StoreWithPersist = Mutate<StoreApi<State>, [['zustand/persist', unknown]]>

export const withStorageDOMEvents = (store: StoreWithPersist) => {
  const cb = (e: StorageEvent) => {
    if (e.key === store.persist.getOptions().name && e.newValue) {
      store.persist.rehydrate()
    }
  }
  window.addEventListener('storage', cb)
  return () => window.removeEventListener('storage', cb)
}
```

---

## 9. Testing

### Philosophy

- Use React Testing Library (RTL) for component tests
- Mock the entire `zustand` module to auto-reset stores between tests
- Use `getInitialState()` for resetting

### Vitest Mock Setup

Create `__mocks__/zustand.ts` (directory must be at Vitest's `root`):

```ts
// __mocks__/zustand.ts
import { act } from '@testing-library/react'
import type * as ZustandExportedTypes from 'zustand'
export * from 'zustand'

const { create: actualCreate, createStore: actualCreateStore } =
  await vi.importActual<typeof ZustandExportedTypes>('zustand')

export const storeResetFns = new Set<() => void>()

const createUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreate(stateCreator)
  const initialState = store.getInitialState()
  storeResetFns.add(() => { store.setState(initialState, true) })
  return store
}

export const create = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  return typeof stateCreator === 'function'
    ? createUncurried(stateCreator)
    : createUncurried
}) as typeof ZustandExportedTypes.create

const createStoreUncurried = <T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  const store = actualCreateStore(stateCreator)
  const initialState = store.getInitialState()
  storeResetFns.add(() => { store.setState(initialState, true) })
  return store
}

export const createStore = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  return typeof stateCreator === 'function'
    ? createStoreUncurried(stateCreator)
    : createStoreUncurried
}) as typeof ZustandExportedTypes.createStore

afterEach(() => {
  act(() => { storeResetFns.forEach((resetFn) => { resetFn() }) })
})
```

```ts
// setup-vitest.ts
import '@testing-library/jest-dom/vitest'
vi.mock('zustand')
```

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./setup-vitest.ts'],
  },
})
```

### Testing Components

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Counter } from './counter'

describe('Counter', () => {
  test('should render with initial state of 1', async () => {
    render(<Counter />)
    expect(await screen.findByText(/^1$/)).toBeInTheDocument()
  })

  test('should increase count by clicking a button', async () => {
    const user = userEvent.setup()
    render(<Counter />)
    await user.click(await screen.findByRole('button', { name: /one up/i }))
    expect(await screen.findByText(/^2$/)).toBeInTheDocument()
  })
})
```

### Testing Stores Directly

```ts
import { useCounterStore } from './stores/counter'

test('should increase count', () => {
  const { getState } = useCounterStore
  expect(getState().count).toBe(1)
  getState().inc()
  expect(getState().count).toBe(2)
})
```

### Testing Context-based Stores

Provide the store via context in the test wrapper:

```tsx
const renderWithStore = (store: CounterStoreApi) => {
  return render(<Counter />, {
    wrapper: ({ children }) => (
      <CounterStoreContext.Provider value={store}>
        {children}
      </CounterStoreContext.Provider>
    ),
  })
}
```

---

## 10. Next.js / SSR

### Key Challenges

1. **Per-request stores** -- server handles multiple requests; stores must not be shared
2. **SSR hydration** -- server and client must produce same initial HTML
3. **SPA routing** -- client-side navigation needs store reset at component level
4. **Server caching** -- App Router aggressively caches; module-state stores are compatible

### Recommended Pattern

1. Use `createStore()` (vanilla) -- not `create()` (which is a singleton)
2. Wrap in React Context -- one store instance per provider
3. Create store in a `useState` initializer -- ensures single creation per component lifecycle

```ts
// stores/counter-store.ts
import { createStore } from 'zustand/vanilla'

export type CounterState = { count: number }
export type CounterActions = { increment: () => void; decrement: () => void }
export type CounterStore = CounterState & CounterActions

export const createCounterStore = (initState: CounterState = { count: 0 }) => {
  return createStore<CounterStore>()((set) => ({
    ...initState,
    increment: () => set((s) => ({ count: s.count + 1 })),
    decrement: () => set((s) => ({ count: s.count - 1 })),
  }))
}
```

```tsx
// providers/counter-store-provider.tsx
'use client'
import { type ReactNode, createContext, useState, useContext } from 'react'
import { useStore } from 'zustand'
import { type CounterStore, createCounterStore } from '@/stores/counter-store'

export type CounterStoreApi = ReturnType<typeof createCounterStore>
const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

export const CounterStoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(() => createCounterStore())
  return (
    <CounterStoreContext.Provider value={store}>
      {children}
    </CounterStoreContext.Provider>
  )
}

export const useCounterStore = <T,>(selector: (store: CounterStore) => T): T => {
  const ctx = useContext(CounterStoreContext)
  if (!ctx) throw new Error('useCounterStore must be used within CounterStoreProvider')
  return useStore(ctx, selector)
}
```

```tsx
// app/layout.tsx (App Router)
import { CounterStoreProvider } from '@/providers/counter-store-provider'

export default function RootLayout({ children }) {
  return (
    <html><body>
      <CounterStoreProvider>{children}</CounterStoreProvider>
    </body></html>
  )
}
```

**Rules:**
- React Server Components should NOT read from or write to stores
- No global `create()` stores in SSR -- use `createStore()` + Context
- Hydrate persisted stores in `useEffect`, not during render

---

## 11. Patterns and Recipes

### Reset State to Initial

```ts
const useStore = create<State & Actions>()((set, get, store) => ({
  count: 0,
  text: '',
  reset: () => set(store.getInitialState()),
}))
```

### Reset All Stores (Global Reset)

```ts
import { type StateCreator, create as actualCreate } from 'zustand'

const storeResetFns = new Set<() => void>()

export const resetAllStores = () => {
  storeResetFns.forEach((resetFn) => resetFn())
}

export const create = (<T>() => {
  return (stateCreator: StateCreator<T>) => {
    const store = actualCreate(stateCreator)
    storeResetFns.add(() => store.setState(store.getInitialState(), true))
    return store
  }
}) as typeof actualCreate
```

### Updater Functions (React-style setState)

```ts
const useStore = create<State>()((set) => ({
  age: 42,
  setAge: (nextAge: number | ((current: number) => number)) => {
    set((state) => ({
      age: typeof nextAge === 'function' ? nextAge(state.age) : nextAge,
    }))
  },
}))

// Usage:
setAge(25)
setAge((current) => current + 1)
```

### URL Hash/Query Param Storage

```ts
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware'

const hashStorage: StateStorage = {
  getItem: (key) => {
    const params = new URLSearchParams(location.hash.slice(1))
    const stored = params.get(key) ?? ''
    return JSON.parse(stored)
  },
  setItem: (key, newValue) => {
    const params = new URLSearchParams(location.hash.slice(1))
    params.set(key, JSON.stringify(newValue))
    location.hash = params.toString()
  },
  removeItem: (key) => {
    const params = new URLSearchParams(location.hash.slice(1))
    params.delete(key)
    location.hash = params.toString()
  },
}

const useStore = create()(
  persist((set, get) => ({ ... }), {
    name: 'hash-store',
    storage: createJSONStorage(() => hashStorage),
  })
)
```

### Dynamic Store Factory (Tab-per-store)

```ts
const createCounterStore = () => createStore<CounterStore>()((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}))

const stores = new Map<string, ReturnType<typeof createCounterStore>>()

const getOrCreateStore = (key: string) => {
  if (!stores.has(key)) stores.set(key, createCounterStore())
  return stores.get(key)!
}

// In component:
const counterState = useStore(getOrCreateStore(`tab-${tabIndex}`))
```

---

## 12. Anti-patterns

### DO NOT: Select Entire State

```ts
// BAD -- re-renders on every state change
const state = useStore()
const { count, name } = useStore((s) => s)

// GOOD -- only re-renders when count changes
const count = useStore((s) => s.count)
```

### DO NOT: Mutate State Directly

```ts
// BAD -- Zustand will not detect the change
set((state) => { state.person.name = 'New'; return { person: state.person } })

// GOOD -- new reference
set((state) => ({ person: { ...state.person, name: 'New' } }))

// GOOD -- with immer middleware
set((state) => { state.person.name = 'New' })
```

### DO NOT: Call get() During Store Initialization

```ts
// BAD -- get() returns undefined during creation
const useStore = create((set, get) => ({
  value: get().someField,  // TypeError!
}))

// GOOD -- call get() inside actions only
const useStore = create((set, get) => ({
  getValue: () => get().someField,
}))
```

### DO NOT: Create New Objects in Selectors Without useShallow

```ts
// BAD -- creates new object every render, always triggers re-render
const data = useStore((s) => ({ count: s.count, name: s.name }))

// GOOD
const data = useStore(useShallow((s) => ({ count: s.count, name: s.name })))

// BEST -- separate selectors if possible
const count = useStore((s) => s.count)
const name = useStore((s) => s.name)
```

### DO NOT: Apply Middleware to Individual Slices

```ts
// BAD -- middleware on individual slice
const createBearSlice = persist((set) => ({ ... }), { name: 'bears' })

// GOOD -- middleware on combined store only
const useStore = create()(
  persist((...a) => ({
    ...createBearSlice(...a),
    ...createFishSlice(...a),
  }), { name: 'bound-store' })
)
```

---

## 13. Comparison with Other Libraries

| Feature | Zustand | Redux Toolkit | Jotai | Valtio |
|---------|---------|--------------|-------|--------|
| **State model** | Immutable, single store | Immutable, single store | Atomic (primitives) | Mutable proxy |
| **Boilerplate** | Minimal | Moderate (slices, RTK) | Minimal | Minimal |
| **Provider required** | No | Yes | Yes | No |
| **Re-render optimization** | Manual selectors | Manual selectors | Automatic (atom deps) | Automatic (proxy) |
| **DevTools** | Via middleware | Built-in | Limited | Limited |
| **Bundle size** | ~1.1kB | ~12kB+ | ~3kB | ~3kB |
| **Best for** | Simple-to-medium stores | Large enterprise apps | Fine-grained atoms | Mutable-style DX |

### Key Zustand Advantages
- No context providers needed (simpler component tree)
- Works outside React (vanilla stores)
- Handles zombie child problem, concurrent mode, context loss correctly
- Tiny bundle size
- Middleware composition is simple
