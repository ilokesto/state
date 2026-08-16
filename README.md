> [!IMPORTANT]
> This repository is archived. Development has moved to [ayden94/ilokesto](https://github.com/ayden94/ilokesto), under [`packages/state`](https://github.com/ayden94/ilokesto/tree/main/packages/state). Please open new issues and pull requests in the monorepo.

# @ilokesto/state

**English** | [한국어](./README.ko.md)

A small multi-framework state helper built on top of `@ilokesto/store`.

This package keeps the store core framework-agnostic and exposes thin adapters for React, Vue, Angular, Svelte, and Solid.

## Features

- Create framework-friendly state adapters from plain state or a reducer
- Subscribe to slices with selectors where the framework supports it naturally
- Read state outside framework lifecycles with `readOnly()`
- Update state outside framework lifecycles with `writeOnly()`
- Compose stores with middleware like `logger`, `debounce`, `persist`, and `devtools`
- Use `adaptor()` for immer-based object updates

## Installation

Install the package plus the framework you want to use.

```bash
pnpm add @ilokesto/state
```

`immer` is an optional peer dependency and is only needed when you use `adaptor()`.

## React

```ts
import { create } from '@ilokesto/state/react';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

function Counter() {
  const [count, setCounter] = useCounter((state) => state.count);

  return (
    <button onClick={() => setCounter((prev) => ({ ...prev, count: prev.count + 1 }))}>
      {count}
    </button>
  );
}
```

## Vue

```ts
import { create } from '@ilokesto/state/vue';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

export function useCounterState() {
  const { state, setState } = useCounter((current) => current.count);

  return {
    count: state,
    increment: () => setState((prev) => ({ ...prev, count: prev.count + 1 })),
  };
}
```

The returned composable must run inside `setup()` or an active `effectScope()`.

## Angular

```ts
import { Component, DestroyRef, inject } from '@angular/core';
import { create } from '@ilokesto/state/angular';

type CounterState = {
  count: number;
};

const counter = create<CounterState>({ count: 0 });

@Component({
  selector: 'app-counter',
  standalone: true,
  template: '<button (click)="increment()">{{ count() }}</button>',
})
export class CounterComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly count = counter((state) => state.count, { destroyRef }).state;

  increment() {
    counter.writeOnly()((prev) => ({ ...prev, count: prev.count + 1 }));
  }
}
```

If you create an Angular signal from this adapter outside an active injection context, pass `{ destroyRef }` explicitly.

## Svelte

```ts
import { create } from '@ilokesto/state/svelte';

type CounterState = {
  count: number;
};

export const counter = create<CounterState>({ count: 0 });
export const count = counter.select((state) => state.count);
```

```svelte
<script lang="ts">
  import { counter, count } from './counter';

  const increment = () => {
    counter.update((state) => ({ ...state, count: state.count + 1 }));
  };
</script>

<button on:click={increment}>{$count}</button>
```

## Solid

```tsx
import { create } from '@ilokesto/state/solid';

type CounterState = {
  count: number;
};

const useCounter = create<CounterState>({ count: 0 });

function Counter() {
  const { state, setState } = useCounter((current) => current.count);

  return (
    <button onClick={() => setState((prev) => ({ ...prev, count: prev.count + 1 }))}>
      {state()}
    </button>
  );
}
```

Call the function returned by `create()` inside a reactive owner such as a component or `createRoot()`. Use `readOnly()` for synchronous reads outside Solid scope.

## Reducer Usage

All framework adapters accept the reducer form:

```ts
type CounterState = {
  count: number;
};

type CounterAction = { type: 'increment' } | { type: 'decrement' };

const counter = create<CounterState, CounterAction>(
  (state, action) => {
    switch (action.type) {
      case 'increment':
        return { count: state.count + 1 };
      case 'decrement':
        return { count: state.count - 1 };
      default:
        return state;
    }
  },
  { count: 0 },
);
```

React returns tuples, Vue returns `{ state, dispatch }`, Angular returns `{ state, dispatch }`, Svelte returns a readable store with `dispatch`, and Solid returns `{ state, dispatch }`.

## Read and Write Outside Framework Lifecycles

```ts
const writeCounter = counter.writeOnly();
const currentCount = counter.readOnly((state) => state.count);

writeCounter((prev) => ({ ...prev, count: prev.count + 1 }));

console.log(currentCount);
```

## Middleware and Utilities

### `@ilokesto/state/middleware`

- `debounce()`
- `devtools()`
- `history()`
- `logger()`
- `persist()`
- `throttle()`
- `validate()`

### `@ilokesto/state/utils`

- `pipe` to compose a store from plain state and registered middleware
- `definePipeableMiddleware()` to register custom pipe middleware metadata
- `adaptor()` to create immutable object updaters with immer

`pipe` is builder-only. Start with `pipe.use(...)`, add middleware in outer-to-inner order, then call `.create(initialState)`. The first `.use()` is outermost during updates, while middleware setup runs left to right when `.create()` creates the Store.

<!-- pipe-example:builder-basics -->
```ts
import { create } from '@ilokesto/state/react';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const decodeCounter = (value: unknown): { readonly count: number } | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;
  return { count: value.count };
};

const counterStore = pipe
  .use(logger({ timestamp: true }))
  .use(persist({ local: 'counter', decode: decodeCounter }))
  .create({ count: 0 });

export const useCounter = create(counterStore);
```

`.create()` accepts plain state only. It does not accept an existing `Store`.

### History, timing, and disposal

`history()` records successful synchronous state changes. It adds `undo()`, `redo()`,
`canUndo()`, `canRedo()`, and `clearHistory()` to the returned store. `undo()` and `redo()`
apply a recorded state through the store, so compatible middleware can observe those changes.

<!-- pipe-example:history-pipe -->
```ts
import { history, logger } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(history({ limit: 20 }))
  .create({ count: 0 });

counterStore.undo();
```

`history()` cannot share a pipe chain with `debounce()` or `throttle()`, in either declaration
order. Delayed updates do not provide the synchronous commit boundary history needs. Pipe rejects
that conflict and never reorders middleware to make a chain valid.

`throttle()` uses leading-drop behavior: the first update passes through immediately, then later
updates are dropped until the wait period ends.

<!-- pipe-example:throttle-pipe -->
```ts
import { logger, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(throttle(250))
  .create({ count: 0 });
```

Timer-based middleware registers cleanup with its store. Call `dispose(store)` when a store is no
longer needed to cancel pending work and release middleware-owned resources. Disposal is scoped to
that store and may be called again safely.

<!-- pipe-example:dispose-store -->
```ts
import { dispose, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe.use(throttle(250)).create({ count: 0 });

dispose(counterStore);
```

### Safe persistence

For persisted data that crosses a trust boundary, pass `decode`. Safe persistence follows
parse, migrate, decode: it parses a stored payload, migrates an older payload to the current
version, then calls `decode` on the migration result. Invalid payloads, failed migrations, failed
decodes, and future versions fall back to the initial state. A successful migration is written
back with the current version. Current-version payloads are decoded without a rewrite.

<!-- pipe-example:safe-persist-pipe -->
```ts
import { persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

type CounterState = { readonly count: number };

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;

  return { count: value.count };
};

const counterStore = pipe
  .use(persist({ local: 'counter', decode: decodeCounter }))
  .create<CounterState>({ count: 0 });
```

`decode` is required. Stored values are never trusted without validation.

Every middleware passed to `.use()` must be registered with `definePipeableMiddleware`, including custom middleware. Its metadata requires an `id`; duplicate IDs reject by default. Set `duplicate: 'allow'` on every occurrence only when repetition is intentional.

`before: ['id']` means this middleware must be declared earlier, which makes it outer. `after: ['id']` means it must be declared later, which makes it inner. A relation to a middleware that is absent is ignored. Pipe rejects invalid present relationships and cycles, and it never reorders middleware for you.

Capabilities make a middleware's Store additions visible to later middleware and the final Store. `requires` must already be available when `.use()` runs, so an earlier outer middleware cannot require a capability supplied by a later inner middleware. `adds` supplies capabilities in the immediate outer-to-inner direction.

<!-- pipe-example:custom-capability -->
```ts
import { definePipeableMiddleware, pipe } from '@ilokesto/state/utils';
import type { PipeAnyMiddleware, PipeCapability } from '@ilokesto/state/utils';

type IncrementCapability = PipeCapability<
  '@example/increment',
  { readonly increment: () => void }
>;

const incrementCapability = {
  id: '@example/increment',
  shape: { increment: (): void => undefined },
} as const satisfies IncrementCapability;

const addIncrement: PipeAnyMiddleware<readonly [], readonly [IncrementCapability]> = (store) => {
  return Object.assign(store, incrementCapability.shape);
};

const incrementMiddleware = definePipeableMiddleware(addIncrement, {
  adds: [incrementCapability],
  id: '@example/increment-middleware',
} as const);

const counterStore = pipe.use(incrementMiddleware).create({ count: 0 });

counterStore.increment();
counterStore.getState().count;
```

This is a breaking change. Callable and variadic pipe syntax has been removed. Replace legacy calls with `pipe.use(...).create(initialState)`.

## Exports

- `@ilokesto/state/react` → React adapter
- `@ilokesto/state/vue` → Vue adapter
- `@ilokesto/state/angular` → Angular adapter
- `@ilokesto/state/svelte` → Svelte adapter
- `@ilokesto/state/solid` → Solid adapter
- `@ilokesto/state/middleware` → middleware helpers
- `@ilokesto/state/utils` → `adaptor`, `pipe`, `definePipeableMiddleware`, and pipe types

## Migration: deep compare → shallow (v2.0.0)

### What changed

The React adapter previously used **deep comparison** (`deepCompare`) to determine whether a selector result should trigger a re-render. Starting from v2.0.0, it uses **shallow comparison** instead — matching the pattern used by zustand. This is a breaking change.

### Why

- **Performance**: deep comparison ran on every render, recursively traversing the entire state. Shallow comparison checks one level only.
- **Correctness**: `deepCompare` could not handle `Map`, `Set`, or `Date` correctly, and would stack-overflow on circular references. Shallow comparison handles `Map`, `Set`, arrays, and plain objects correctly, and is inherently safe against circular references.
- **Ecosystem alignment**: zustand v5 uses shallow comparison as the standard pattern.

### What this means for you

| Pattern | Before (deep) | After (shallow) |
|---|---|---|
| `useStore(s => s.count)` | Works | Works (same) |
| `useStore(s => ({ a: s.a, b: s.b }))` | Deep-compared (always equal if values match) | Shallow-compared (equal if 1st-level values match) |
| Nested object in selector result | Deep-compared | Reference-compared (`Object.is`) |
| `Map` / `Set` in state | Incorrect comparison | Correct shallow comparison |
| `Date` in state | Incorrect comparison | Correct shallow comparison via `getTime()` |

### If you need deep comparison

Use `useMemo` to memoize your selector result:

```ts
const value = useMemo(() => {
  return computeDerivedState(store.getState());
}, [dependency]);
```

Or return a primitive from your selector so `Object.is` is sufficient:

```ts
const time = useStore(s => s.date.getTime());
```

### Keep selector identity stable

The shallow selector cache is keyed on the selector function identity. An inline selector
(e.g. `useStore(s => ({ a: s.a, b: s.b }))`) creates a new function reference on every render,
which resets the cache and defeats the shallow optimization. Prefer one of:

```ts
// 1. Module-scope selector (preferred for pure derivations)
const selectSlice = (s: State) => ({ a: s.a, b: s.b });
const slice = useStore(selectSlice);

// 2. useCallback when the selector depends on props or other reactive inputs
const selectFiltered = useCallback(
  (s: State) => s.items.filter(i => i.id === activeId),
  [activeId],
);
const filtered = useStore(selectFiltered);
```

Returning a new object/array literal inside an inline selector also produces a new reference
each call; the shallow comparison still avoids a re-render when first-level values match, but
stabilizing the selector identity lets `useSyncExternalStore` skip the comparison entirely.

## Development

```bash
pnpm install
pnpm build
```

Build outputs are generated in the `dist` directory.

## License

MIT
