import { jsonStorage } from '../src/middleware';
import { expect, jest, test } from 'bun:test';

import { debounce, persist, throttle } from '../src/middleware';
import { AsyncMemoryStorage, decodeCounter as decodeStoredCounter } from './helpers/persistStorage';
import { PipeConfigurationError } from '../src/utils/pipe/errors';
import { pipe } from '../src/utils/pipe';
import { withBrowserFakes } from './helpers/browserFakes';

type CounterState = {
  readonly count: number;
};

type BunFakeTimerMethod =
  | 'advanceTimersByTime'
  | 'clearAllTimers'
  | 'useFakeTimers'
  | 'useRealTimers';

function callBunFakeTimer(methodName: BunFakeTimerMethod, args: readonly unknown[] = []): void {
  const method: unknown = Reflect.get(jest, methodName);
  if (typeof method !== 'function') {
    throw new TypeError(`Bun fake timer method ${methodName} is unavailable`);
  }

  Reflect.apply(method, jest, args);
}

const decodeCounter = (value: unknown): CounterState | null => {
  if (typeof value !== 'object' || value === null || !('count' in value)) {
    return null;
  }

  return typeof value.count === 'number' ? { count: value.count } : null;
};

function useAtRuntime(builder: object, middleware: object): object {
  const use = Reflect.get(builder, 'use');
  if (typeof use !== 'function') {
    throw new TypeError('Pipe builder must expose use');
  }

  const nextBuilder = Reflect.apply(use, builder, [middleware]);
  if (typeof nextBuilder !== 'object' || nextBuilder === null) {
    throw new TypeError('Pipe use must return a builder');
  }

  return nextBuilder;
}

for (const timing of [debounce(25), throttle(25)]) {
  test('rehydrate: timing middleware has a pending update -> restores immediately without flushing its timer', async () => {
    callBunFakeTimer('useFakeTimers');
    const adapter = new AsyncMemoryStorage();
    adapter.value = { state: { count: 7 }, version: 0 };
    const store = pipe.use(timing).use(persist({
      key: 'timed', decode: decodeStoredCounter, storage: () => adapter,
    })).create({ count: 0 });
    try {
      await store.persist.rehydrate();
      expect(store.getState()).toEqual({ count: 7 });
      store.set({ count: 8 });
      // Debounce has no commit yet; throttle may have its leading commit.
      const committed = store.getState();
      await store.persist.flush();
      expect(store.getState()).toBe(committed);
      callBunFakeTimer('advanceTimersByTime', [25]);
      await store.persist.flush();
      expect(store.getState()).toEqual({ count: 8 });
      expect(adapter.value).toEqual({ state: { count: 8 }, version: 0 });
    } finally {
      callBunFakeTimer('clearAllTimers');
      callBunFakeTimer('useRealTimers');
    }
  });
}

test('Given persist before debounce, when the pipe chain is declared, then it rejects before storage effects', async () => {
  // Given
  await withBrowserFakes<CounterState, Promise<void>>(async (storage) => {
    const unsafeOrder = () => useAtRuntime(
      useAtRuntime(pipe, persist({ decode: decodeCounter, key: 'persist-before-debounce', storage: jsonStorage(() => localStorage) })),
      debounce(25),
    );

    // When / Then
    try {
      unsafeOrder();
      throw new TypeError('Expected pipe configuration error');
    } catch (error) {
      expect(error).toBeInstanceOf(PipeConfigurationError);
      if (error instanceof PipeConfigurationError) {
        expect(error.code).toBe('MIDDLEWARE_ORDER');
      } else {
        throw error;
      }
    }

    expect(storage.reads).toBe(0);
    expect(storage.writes).toBe(0);
  });
});

test('Given debounce before persist, when an update commits after the debounce window, then it persists the committed state', async () => {
  // Given
  callBunFakeTimer('useFakeTimers');

  try {
    await withBrowserFakes<CounterState, Promise<void>>(async (storage) => {
      const store = pipe
        .use(debounce(25))
        .use(persist({ decode: decodeCounter, key: 'debounce-before-persist', storage: jsonStorage(() => localStorage) }))
        .create<CounterState>({ count: 0 });
    await store.persist.rehydrate();
    await store.persist.flush();

      // When
      store.setState({ count: 1 });
    await store.persist.flush();
      callBunFakeTimer('advanceTimersByTime', [25]);
      await store.persist.flush();

      // Then
      expect(storage.reads).toBe(1);
      expect(storage.writes).toBe(1);
      expect(store.getState()).toEqual({ count: 1 });
      expect(JSON.parse(storage.getItem('debounce-before-persist') ?? '')).toEqual({
        state: { count: 1 },
        version: 0,
      });
    });
  } finally {
    callBunFakeTimer('clearAllTimers');
    callBunFakeTimer('useRealTimers');
  }
});
