import { expect, test } from 'bun:test';

import { persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { restoreBrowserGlobal, withBrowserFakes } from './helpers/browserFakes';

type CounterState = {
  readonly count: number;
};

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  if (typeof value.count !== 'number') return null;
  return { count: value.count };
};

test('Given no window global, when persist reads storage during module evaluation, then it returns null instead of crashing', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

  try {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'document');

    expect(() =>
      pipe
        .use(persist({ decode: decodeCounter, local: 'ssr-no-crash' }))
        .create({ count: 0 }),
    ).not.toThrow();
  } finally {
    restoreBrowserGlobal('window', windowDescriptor);
    restoreBrowserGlobal('localStorage', localStorageDescriptor);
    restoreBrowserGlobal('document', documentDescriptor);
  }
});

test('Given no window global, when persist hydrates on server, then store stays at initial state', () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

  try {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'document');

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'ssr-initial' }))
      .create<CounterState>({ count: 0 });

    expect(store.getState()).toEqual({ count: 0 });
    expect(store.persist.hasHydrated()).toBe(true);
  } finally {
    restoreBrowserGlobal('window', windowDescriptor);
    restoreBrowserGlobal('localStorage', localStorageDescriptor);
    restoreBrowserGlobal('document', documentDescriptor);
  }
});

test('Given skipHydration true, when persist creates a store, then hasHydrated is false and state stays at initial', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('skip-hydration', JSON.stringify({ state: { count: 5 }, version: 0 }));

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'skip-hydration', skipHydration: true }))
      .create<CounterState>({ count: 0 });

    expect(store.persist.hasHydrated()).toBe(false);
    expect(store.getState()).toEqual({ count: 0 });
  });
});

test('Given skipHydration true, when rehydrate is called, then state is applied and hasHydrated becomes true', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('skip-then-rehydrate', JSON.stringify({ state: { count: 7 }, version: 0 }));

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'skip-then-rehydrate', skipHydration: true }))
      .create<CounterState>({ count: 0 });

    expect(store.getState()).toEqual({ count: 0 });
    expect(store.persist.hasHydrated()).toBe(false);

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 7 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given skipHydration true and no stored value, when rehydrate is called, then state stays at initial and hasHydrated becomes true', () => {
  withBrowserFakes<CounterState>(() => {
    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'skip-empty', skipHydration: true }))
      .create<CounterState>({ count: 0 });

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 0 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given eager hydration (default), when persist creates a store, then hasHydrated is immediately true', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('eager-hydration', JSON.stringify({ state: { count: 3 }, version: 0 }));

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'eager-hydration' }))
      .create<CounterState>({ count: 0 });

    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState()).toEqual({ count: 3 });
  });
});

test('Given skipHydration true, when rehydrate is called twice, then the second call is a no-op', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('double-rehydrate', JSON.stringify({ state: { count: 9 }, version: 0 }));
    storage.writes = 0;

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'double-rehydrate', skipHydration: true }))
      .create<CounterState>({ count: 0 });

    store.persist.rehydrate();
    expect(store.getState()).toEqual({ count: 9 });

    storage.setItem('double-rehydrate', JSON.stringify({ state: { count: 42 }, version: 0 }));

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 9 });
  });
});

test('Given skipHydration true, when state changes before rehydrate, then the change is persisted and rehydrate reads the latest stored value', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('change-before-rehydrate', JSON.stringify({ state: { count: 5 }, version: 0 }));

    const store = pipe
      .use(persist({ decode: decodeCounter, local: 'change-before-rehydrate', skipHydration: true }))
      .create<CounterState>({ count: 0 });

    store.setState({ count: 10 });
    expect(JSON.parse(storage.getItem('change-before-rehydrate') ?? '')).toEqual({
      state: { count: 10 },
      version: 0,
    });

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 10 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given onRehydrateStorage callback, when rehydrate succeeds, then the callback receives the rehydrated state', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('callback-success', JSON.stringify({ state: { count: 8 }, version: 0 }));

    const received: Array<{ state: CounterState | undefined; error: unknown }> = [];

    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'callback-success',
          skipHydration: true,
          onRehydrateStorage: (state) => (s, error) => {
            received.push({ state: s, error });
            void state;
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    store.persist.rehydrate();

    expect(received).toHaveLength(1);
    expect(received[0]?.state).toEqual({ count: 8 });
    expect(received[0]?.error).toBeUndefined();
  });
});

test('Given onRehydrateStorage callback and no stored value, when rehydrate is called, then the callback receives initial state', () => {
  withBrowserFakes<CounterState>(() => {
    const received: Array<{ state: CounterState | undefined; error: unknown }> = [];

    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'callback-empty',
          skipHydration: true,
          onRehydrateStorage: () => (s, error) => {
            received.push({ state: s, error });
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    store.persist.rehydrate();

    expect(received).toHaveLength(1);
    expect(received[0]?.state).toEqual({ count: 0 });
    expect(received[0]?.error).toBeUndefined();
  });
});

test('Given skipHydration true with session storage, when rehydrate is called, then session value is applied', () => {
  withBrowserFakes<CounterState>((_, __, browserStorage) => {
    browserStorage.sessionStorage.setItem(
      'skip-session',
      JSON.stringify({ state: { count: 6 }, version: 0 }),
    );

    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          session: 'skip-session',
          skipHydration: true,
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(store.getState()).toEqual({ count: 0 });
    expect(store.persist.hasHydrated()).toBe(false);

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 6 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given skipHydration true with cookie storage, when rehydrate is called, then cookie value is applied', () => {
  withBrowserFakes<CounterState>((_, __, browserStorage) => {
    browserStorage.cookieDocument.cookie = `skip-cookie=${JSON.stringify({
      state: { count: 4 },
      version: 0,
    })}`;

    const store = pipe
      .use(
        persist({
          cookie: 'skip-cookie',
          decode: decodeCounter,
          skipHydration: true,
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(store.getState()).toEqual({ count: 0 });

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 4 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given skipHydration true with migration, when rehydrate is called, then migration runs and result is applied', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem(
      'skip-migrate',
      JSON.stringify({ state: { count: 2 }, version: 0 }),
    );

    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'skip-migrate',
          skipHydration: true,
          migrate: [(state: unknown) => ({ count: (state as CounterState).count + 1 })],
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(store.getState()).toEqual({ count: 0 });

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 3 });
    expect(store.persist.hasHydrated()).toBe(true);
  });
});