# @ilokesto/state

**English** | [한국어](./README.ko.md)

A small React state helper built on top of `@ilokesto/store`.

This package wraps the vanilla store core with a React-friendly `create()` API, selector-based subscriptions, reducer support, and optional middleware utilities.

## Features

- Create a React hook from plain state or a reducer
- Subscribe to slices with selectors
- Read state outside components with `readOnly()`
- Update state outside components with `writeOnly()`
- Compose stores with middleware like `logger`, `debounce`, `persist`, and `devtools`
- Use `adaptor()` for immer-based object updates

## Installation

```bash
pnpm add @ilokesto/state react immer
```

or

```bash
npm install @ilokesto/state react immer
```

`immer` is listed as an optional peer dependency and is only needed when you use `adaptor()`.

## Basic Usage

```ts
import { create } from '@ilokesto/state';

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

## Reducer Usage

```ts
import { create } from '@ilokesto/state';

type CounterState = {
  count: number;
};

type CounterAction = { type: 'increment' } | { type: 'decrement' };

const useCounter = create<CounterState, CounterAction>(
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

const [count, dispatch] = useCounter((state) => state.count);

dispatch({ type: 'increment' });
```

## Read and Write Outside Components

```ts
const setCounter = useCounter.writeOnly();
const currentCount = useCounter.readOnly((state) => state.count);

setCounter((prev) => ({ ...prev, count: prev.count + 1 }));

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
import { create } from '@ilokesto/state';
import { logger, persist } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';

const counterStore = pipe({ count: 0 }, logger({ timestamp: true }), persist({ local: 'counter' }));

export const useCounter = create(counterStore);
```

## Exports

- `@ilokesto/state` → `create`
- `@ilokesto/state/middleware` → `middleware`
- `@ilokesto/state/utils` → `adaptor`, `pipe`

## Development

```bash
pnpm install
pnpm build
```

Build outputs are generated in the `dist` directory.

## License

MIT
