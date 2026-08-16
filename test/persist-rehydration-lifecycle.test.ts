import { expect, test } from 'bun:test';

import { persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { withBrowserFakes } from './helpers/browserFakes';

type CounterState = {
  readonly count: number;
};

type HydrationCall = {
  readonly error: unknown;
  readonly phase: 'pre' | 'post';
  readonly state: CounterState | undefined;
};

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) return null;
  return typeof value.count === 'number' ? { count: value.count } : null;
};

test('Given eager hydration callbacks, when the store is created, then pre and post observe the lifecycle once', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('lifecycle-eager', JSON.stringify({ state: { count: 4 }, version: 0 }));
    const calls: HydrationCall[] = [];

    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-eager',
          onRehydrateStorage: (state) => {
            calls.push({ error: undefined, phase: 'pre', state });
            return (nextState, error) => {
              calls.push({ error, phase: 'post', state: nextState });
            };
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(calls).toEqual([
      { error: undefined, phase: 'pre', state: { count: 0 } },
      { error: undefined, phase: 'post', state: { count: 4 } },
    ]);
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given live state and empty storage, when manual hydration runs, then live state is the successful fallback', () => {
  withBrowserFakes<CounterState>((storage) => {
    const calls: HydrationCall[] = [];
    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-live-fallback',
          skipHydration: true,
          onRehydrateStorage: (state) => {
            calls.push({ error: undefined, phase: 'pre', state });
            return (nextState, error) => {
              calls.push({ error, phase: 'post', state: nextState });
            };
          },
        }),
      )
      .create<CounterState>({ count: 0 });
    store.setState({ count: 9 });
    storage.clear();

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 9 });
    expect(calls).toEqual([
      { error: undefined, phase: 'pre', state: { count: 9 } },
      { error: undefined, phase: 'post', state: { count: 9 } },
    ]);
  });
});

test('Given a storage read failure, when manual hydration runs, then live state remains and the original error is reported once', () => {
  withBrowserFakes<CounterState>((storage) => {
    const readError = new TypeError('read failed');
    const calls: HydrationCall[] = [];
    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-read-failure',
          skipHydration: true,
          onRehydrateStorage: (state) => {
            calls.push({ error: undefined, phase: 'pre', state });
            return (nextState, error) => {
              calls.push({ error, phase: 'post', state: nextState });
            };
          },
        }),
      )
      .create<CounterState>({ count: 0 });
    store.setState({ count: 6 });
    storage.getItem = () => {
      throw readError;
    };

    store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 6 });
    expect(calls).toEqual([
      { error: undefined, phase: 'pre', state: { count: 6 } },
      { error: readError, phase: 'post', state: undefined },
    ]);
    expect(store.persist.hasHydrated()).toBe(true);
  });
});

test('Given malformed storage, when hydration runs, then its SyntaxError reaches the post callback', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('lifecycle-malformed', '{');
    let receivedError: unknown;

    pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-malformed',
          onRehydrateStorage: () => (state, error) => {
            void state;
            receivedError = error;
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(receivedError).toBeInstanceOf(SyntaxError);
  });
});

test('Given migration and decoder failures, when hydration runs, then each original error is reported', () => {
  withBrowserFakes<CounterState>((storage) => {
    const migrationError = new RangeError('migration failed');
    const decoderError = new TypeError('decode failed');
    const received: unknown[] = [];
    storage.setItem('lifecycle-migration-error', JSON.stringify({ state: {}, version: 0 }));
    storage.setItem('lifecycle-decoder-error', JSON.stringify({ state: {}, version: 0 }));

    pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-migration-error',
          migrate: [() => {
            throw migrationError;
          }],
          onRehydrateStorage: () => (state, error) => {
            void state;
            received.push(error);
          },
        }),
      )
      .create({ count: 0 });
    pipe
      .use(
        persist({
          decode: (): CounterState | null => {
            throw decoderError;
          },
          local: 'lifecycle-decoder-error',
          onRehydrateStorage: () => (state, error) => {
            void state;
            received.push(error);
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(received).toEqual([migrationError, decoderError]);
  });
});

test('Given a decoder rejection, when hydration runs, then it reports a typed failure and preserves live state', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('lifecycle-decode-rejection', JSON.stringify({ state: {}, version: 0 }));
    let receivedError: unknown;

    const store = pipe
      .use(
        persist({
          decode: (): CounterState | null => null,
          local: 'lifecycle-decode-rejection',
          onRehydrateStorage: () => (state, error) => {
            void state;
            receivedError = error;
          },
        }),
      )
      .create<CounterState>({ count: 3 });

    expect(store.getState()).toEqual({ count: 3 });
    expect(receivedError).toBeInstanceOf(TypeError);
  });
});

test('Given a post callback that throws, when hydration completes, then the error propagates once after hydration', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('lifecycle-post-throw', JSON.stringify({ state: { count: 2 }, version: 0 }));
    const callbackError = new TypeError('post callback failed');
    let callbackCalls = 0;
    let hydratedInCallback = false;
    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-post-throw',
          skipHydration: true,
          onRehydrateStorage: () => () => {
            callbackCalls += 1;
            hydratedInCallback = store.persist.hasHydrated();
            throw callbackError;
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(() => store.persist.rehydrate()).toThrow(callbackError);
    expect(callbackCalls).toBe(1);
    expect(hydratedInCallback).toBe(true);
    expect(store.persist.hasHydrated()).toBe(true);
    expect(() => store.persist.rehydrate()).not.toThrow();
    expect(callbackCalls).toBe(1);
  });
});

test('Given a pre callback that throws, when hydration starts, then hydration remains eligible for retry', () => {
  withBrowserFakes<CounterState>((storage) => {
    storage.setItem('lifecycle-pre-throw', JSON.stringify({ state: { count: 2 }, version: 0 }));
    const callbackError = new TypeError('pre callback failed');
    let preCalls = 0;
    const store = pipe
      .use(
        persist({
          decode: decodeCounter,
          local: 'lifecycle-pre-throw',
          skipHydration: true,
          onRehydrateStorage: () => {
            preCalls += 1;
            throw callbackError;
          },
        }),
      )
      .create<CounterState>({ count: 0 });

    expect(() => store.persist.rehydrate()).toThrow(callbackError);
    expect(store.persist.hasHydrated()).toBe(false);
    expect(store.getState()).toEqual({ count: 0 });
    expect(() => store.persist.rehydrate()).toThrow(callbackError);
    expect(preCalls).toBe(2);
  });
});
