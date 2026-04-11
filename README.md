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
- `logger()`
- `persist()`
- `validate()`

### `@ilokesto/state/utils`

- `pipe()` to compose a store from plain state and middleware
- `adaptor()` to create immutable object updaters with immer

```ts
import { create } from '@ilokesto/state/react';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe({ count: 0 }, logger({ timestamp: true }), persist({ local: 'counter' }));

export const useCounter = create(counterStore);
```

## Exports

- `@ilokesto/state/react` → React adapter
- `@ilokesto/state/vue` → Vue adapter
- `@ilokesto/state/angular` → Angular adapter
- `@ilokesto/state/svelte` → Svelte adapter
- `@ilokesto/state/solid` → Solid adapter
- `@ilokesto/state/middleware` → middleware helpers
- `@ilokesto/state/utils` → `adaptor`, `pipe`

## Development

```bash
pnpm install
pnpm build
```

Build outputs are generated in the `dist` directory.

## License

MIT
