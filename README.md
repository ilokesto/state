# @ilokesto/state

Shared TypeScript state and middleware with thin React, Vue, Angular, Svelte, and Solid bindings.

[![npm](https://img.shields.io/npm/v/@ilokesto/state?style=flat&color=555)](https://www.npmjs.com/package/@ilokesto/state)
![MIT](https://img.shields.io/badge/license-MIT-555?style=flat)

[한국어](./README.ko.md)

- Create plain or reducer state once, then bind it to your framework.
- Subscribe to slices using one shared shallow-equality contract.
- Compose validation, persistence, history, logging, and timing middleware.

## Installation

```sh
pnpm add @ilokesto/state
```

Install your chosen framework alongside the package. The example below uses React.
`immer` is an optional peer needed only for `@ilokesto/state/adaptor`.

## Quick start

Create a shared React hook outside the component with `create()`:

```tsx
import { create } from '@ilokesto/state/react';

const useCounter = create({ count: 0 });

export function Counter() {
  const [count, setCounter] = useCounter(state => state.count);

  return (
    <button
      onClick={() => setCounter(previous => ({ ...previous, count: previous.count + 1 }))}
    >
      {count}
    </button>
  );
}
```

Keep selectors pure. Hoist selectors when you need a stable function reference.
Objects are shallow-compared, not deeply compared;
return fresh immutable state when updating nested values. React server snapshots
select from initial state. Other adapters retain their own lifecycle requirements.

The hook returns `[state, setter]`, or `[selectedValue, setter]` with a selector.
The setter updates the full state even when a selector is used. For reducer state,
use `create(reducer, initialState)` to receive `[state, dispatch]`.

Use the builder form `pipe.use(...).create(initialState)`. `history()` records
timer commits; undo/redo cancel pending timers and replay through validation.
Timer controls are `store.debounce` and `store.throttle` (`flush`, `cancel`, `pending`).
Declare `debounce()` before `persist()`.
Persistence requires `key`, a storage factory, and `decode`, with explicit async
`rehydrate()` and `flush()`.
Call `dispose(store)` to release middleware resources; await `flush()` first if saving.

<details>
<summary>Middleware examples</summary>

### Builder basics

<!-- pipe-example:builder-basics -->
```ts
import { create } from '@ilokesto/state/react';
import { jsonStorage, logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const decodeCounter = (value: unknown): { readonly count: number } | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;
  return { count: value.count };
};

const counterStore = pipe
  .use(logger({ timestamp: true }))
  .use(persist({ key: 'counter', storage: jsonStorage(() => window.localStorage), decode: decodeCounter }))
  .create({ count: 0 });

export const useCounter = create(counterStore);

export async function restoreCounter() {
  await counterStore.persist.rehydrate();
}
```

### History

<!-- pipe-example:history-pipe -->
```ts
import { debounce, history, logger } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(history({ limit: 20 }))
  .use(debounce(250, { mode: 'quiet' }))
  .create({ count: 0 });

counterStore.set({ count: 1 });
counterStore.debounce.flush();
counterStore.undo();
```

### Throttle

<!-- pipe-example:throttle-pipe -->
```ts
import { logger, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe
  .use(logger())
  .use(throttle(250))
  .create({ count: 0 });
```

### Disposal

<!-- pipe-example:dispose-store -->
```ts
import { dispose, throttle } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe.use(throttle(250)).create({ count: 0 });

dispose(counterStore);
```

### Safe persistence

<!-- pipe-example:safe-persist-pipe -->
```ts
import { indexedDBStorage, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

type CounterState = { readonly count: number };

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null) return null;
  if (!('count' in value) || typeof value.count !== 'number') return null;

  return { count: value.count };
};

const counterStore = pipe
  .use(persist({
    key: 'counter',
    storage: indexedDBStorage({ database: 'my-app-state' }),
    decode: decodeCounter,
  }))
  .create<CounterState>({ count: 0 });

await counterStore.persist.rehydrate();
counterStore.setState({ count: 1 });
await counterStore.persist.flush();
```

### Custom capabilities

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

</details>

<details>
<summary>Development</summary>

Use Node 24.22.1 and pnpm 10.17.1. Run these commands from this repository root.
`pnpm test` also requires Bun for the distribution tests.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:typecheck
pnpm test:browser
pnpm test:tooling
```

Build output goes to `dist/`.

Pull requests run Verify CI. Main merges create or update a Changesets release PR; merging
that PR publishes only the exact successful Verify artifact through GitHub Actions. Enable
`Allow GitHub Actions to create and approve pull requests` and configure `NPM_TOKEN` in the
`Production` environment before rollout. Never publish locally.

</details>
