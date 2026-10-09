import { jsonStorage } from '../src/middleware';
import { expect, jest, spyOn, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import './pipe-history-integration.test';
import { create as createAngular } from '../src/core/Angular';
import { create as createReact } from '../src/core/React';
import { create as createSolid } from '../src/core/Solid';
import { create as createSvelte } from '../src/core/Svelte';
import { create as createVue } from '../src/core/Vue';
import { debounce, devtools, logger, persist, validate } from '../src/middleware';
import { definePipeableMiddleware } from '../src/utils/pipe/metadata';
import { pipe } from '../src/utils/pipe/index';

type CounterState = Readonly<{ count: number }>;
type CounterAction = Readonly<{ type: 'increment' }>;

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  if (typeof value.count !== 'number') return null;
  return { count: value.count };
};

type DevtoolsConnection = {
  readonly inits: CounterState[];
  readonly sends: Array<{ readonly action: string; readonly state: CounterState }>;
};

type ReducerAdapter = Readonly<{
  readonly readOnly: () => CounterState;
  readonly writeOnly: () => (action: CounterAction) => void;
}>;

type Framework = Readonly<{
  readonly create: (
    reducer: (state: CounterState, action: CounterAction) => CounterState,
    store: Store<CounterState>,
  ) => ReducerAdapter;
}>;

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  reads = 0;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function restoreGlobal(name: 'localStorage' | 'window', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }

  Object.defineProperty(globalThis, name, descriptor);
}

async function withBrowserFakes(action: (storage: MemoryStorage, connections: DevtoolsConnection[]) => Promise<void>): Promise<void> {
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new MemoryStorage();
  const connections: DevtoolsConnection[] = [];

  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __REDUX_DEVTOOLS_EXTENSION__: {
          connect: () => {
            const connection: DevtoolsConnection = { inits: [], sends: [] };
            connections.push(connection);
            return {
              init: (state: Readonly<CounterState>) => connection.inits.push({ ...state }),
              send: (action: string, state: Readonly<CounterState>) =>
                connection.sends.push({ action, state: { ...state } }),
              subscribe: () => undefined,
            };
          },
        },
      },
    });
    await action(storage, connections);
  } finally {
    restoreGlobal('localStorage', localStorageDescriptor);
    restoreGlobal('window', windowDescriptor);
  }
}

function isCounterState(value: unknown): value is CounterState {
  return typeof value === 'object' && value !== null && 'count' in value && typeof value.count === 'number';
}

function useAtRuntime(builder: object, middleware: object): object {
  const use = Reflect.get(builder, 'use');
  if (typeof use !== 'function') {
    throw new TypeError('Pipe builder must expose use');
  }

  const nextBuilder = Reflect.apply(use, builder, [middleware]);
  if ((typeof nextBuilder !== 'object' && typeof nextBuilder !== 'function') || nextBuilder === null) {
    throw new TypeError('Pipe builder use must return an object');
  }

  return nextBuilder;
}

test('Given validate and debounce in either declaration order, when valid and invalid updates are applied, then validation retains its respective immediate or delayed timing', () => {
  // Given
  jest.useFakeTimers();
  const errorSpy = spyOn(console, 'error').mockImplementation(() => undefined);
  const validations: number[] = [];
  const schema = {
    '~standard': {
      validate: (value: unknown) => {
        if (isCounterState(value)) {
          validations.push(value.count);
          return value.count >= 0 ? { value } : { issues: [{ message: 'count must be positive' }] };
        }
        return { issues: [{ message: 'count must be a number' }] };
      },
      vendor: 'test',
      version: 1 as const,
    },
  } as const;

  try {
    const validateThenDebounce = pipe.use(validate(schema)).use(debounce(10)).create({ count: 0 });
    const debounceThenValidate = pipe.use(debounce(10)).use(validate(schema)).create({ count: 0 });

    // When
    validateThenDebounce.setState({ count: -1 });
    debounceThenValidate.setState({ count: -1 });

    // Then
    expect(validations).toEqual([-1]);
    jest.advanceTimersByTime(10);
    expect(validations).toEqual([-1, -1]);
    expect(validateThenDebounce.getState()).toEqual({ count: 0 });
    expect(debounceThenValidate.getState()).toEqual({ count: 0 });
  } finally {
    errorSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given persist and devtools in either order and a noncanonical five-built-in chain, when builders create Stores, then hydration and initialization retain setup order without a canonical order requirement', async () => {
  // Given
  jest.useFakeTimers();

  try {
    await withBrowserFakes(async (storage, connections) => {
      storage.values.set('persist-first', JSON.stringify({ state: { count: 5 }, version: 0 }));
      storage.values.set('devtools-first', JSON.stringify({ state: { count: 3 }, version: 0 }));
      storage.values.set('all-built-ins', JSON.stringify({ state: { count: 7 }, version: 0 }));

      // When
      const persistFirst = pipe
        .use(persist({ decode: decodeCounter, key: 'persist-first', storage: jsonStorage(() => localStorage) }))
        .use(devtools('persist-first'))
        .create<CounterState>({ count: 0 });
      const devtoolsFirst = pipe
        .use(devtools('devtools-first'))
        .use(persist({ decode: decodeCounter, key: 'devtools-first', storage: jsonStorage(() => localStorage) }))
        .create<CounterState>({ count: 0 });
      const allBuiltIns = pipe
        .use(debounce(10))
        .use(devtools('all-built-ins'))
        .use(validate({ '~standard': { validate: (value: unknown) => ({ value }), vendor: 'test', version: 1 as const } }))
        .use(persist({ decode: decodeCounter, key: 'all-built-ins', storage: jsonStorage(() => localStorage) }))
        .use(logger({ timestamp: false }))
        .create<CounterState>({ count: 0 });

      expect(allBuiltIns.getState()).toEqual({ count: 0 });
      await Promise.all([persistFirst.persist.rehydrate(), devtoolsFirst.persist.rehydrate(), allBuiltIns.persist.rehydrate()]);

      // Then
      expect(persistFirst.getState()).toEqual({ count: 5 });
      expect(devtoolsFirst.getState()).toEqual({ count: 3 });
      expect(allBuiltIns.getState()).toEqual({ count: 7 });
      expect(connections).toHaveLength(3);
      expect(connections[0]).toEqual({ inits: [{ count: 0 }], sends: [{ action: 'persist-first:persist/rehydrate', state: { count: 5 } }] });
      expect(connections[1]).toEqual({
        inits: [{ count: 0 }],
        sends: [{ action: 'devtools-first:persist/rehydrate', state: { count: 3 } }],
      });
      expect(connections[2]).toEqual({
        inits: [{ count: 0 }],
        sends: [{ action: 'all-built-ins:persist/rehydrate', state: { count: 7 } }],
      });
      expect(storage.reads).toBe(3);
    });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given a prebuilt Store and reducer, when each framework adapter consumes it through lifecycle-free methods, then every adapter dispatches into the same Store', () => {
  // Given
  const reducer = (state: CounterState, action: CounterAction): CounterState =>
    action.type === 'increment' ? { count: state.count + 1 } : state;
  const frameworks: readonly Framework[] = [
    { create: (nextReducer, store) => createReact(nextReducer, store) },
    { create: (nextReducer, store) => createVue(nextReducer, store) },
    { create: (nextReducer, store) => createAngular(nextReducer, store) },
    { create: (nextReducer, store) => createSvelte(nextReducer, store) },
    { create: (nextReducer, store) => createSolid(nextReducer, store) },
  ];

  for (const framework of frameworks) {
    const store = new Store<CounterState>({ count: 0 });
    const adapter = framework.create(reducer, store);

    // When
    adapter.writeOnly()({ type: 'increment' });

    // Then
    expect(adapter.readOnly()).toEqual({ count: 1 });
    expect(store.getState()).toEqual({ count: 1 });
  }
});

test('Given invalid static metadata or a throwing middleware, when the builder is used or created, then no setup starts for invalid chains and exceptions stop later middleware', () => {
  // Given
  let setupCalls = 0;
  let laterCalls = 0;
  const first = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    setupCalls += 1;
    return store;
  }, { after: ['@test/second'], id: '@test/first' } as const);
  const second = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    setupCalls += 1;
    return store;
  }, { id: '@test/second' } as const);
  const failure = new TypeError('middleware failed');
  const throwing = definePipeableMiddleware(<State>(_store: Store<State>): Store<State> => {
    throw failure;
  }, { id: '@test/throwing' } as const);
  const later = definePipeableMiddleware(<State>(store: Store<State>): Store<State> => {
    laterCalls += 1;
    return store;
  }, { id: '@test/later' } as const);

  // When / Then
  const firstBuilder = useAtRuntime(pipe, first);
  expect(() => useAtRuntime(firstBuilder, second)).toThrow(
    expect.objectContaining({ code: 'MIDDLEWARE_ORDER' }),
  );
  expect(setupCalls).toBe(0);
  const throwingBuilder = useAtRuntime(useAtRuntime(pipe, throwing), later);
  expect(() => Reflect.apply(Reflect.get(throwingBuilder, 'create'), throwingBuilder, [{ count: 0 }])).toThrow(
    failure,
  );
  expect(laterCalls).toBe(0);
});
