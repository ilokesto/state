import { expect, jest, test } from 'bun:test';

import { Store } from '@ilokesto/store';
import { debounce, dispose, history, HistoryConfigurationError, throttle } from '../src/middleware';
import type { HistoryControls } from '../src/middleware';
import { PipeConfigurationError } from '../src/utils/pipe/errors';
import { definePipeableMiddleware, getPipeableMiddlewareMetadata } from '../src/utils/pipe/metadata';
import { pipe } from '../src/utils/pipe';
import type { PipeAnyMiddleware } from '../src/utils/pipe/types';

const controlKeys = [
  'undo', 'redo', 'canUndo', 'canRedo', 'clearHistory', 'group',
  'pauseHistory', 'resumeHistory', 'getHistoryStatus', 'subscribeHistory',
] as const satisfies readonly (keyof HistoryControls)[];

function useAtRuntime(builder: object, middleware: object): object {
  const use = Reflect.get(builder, 'use');
  if (typeof use !== 'function') {
    throw new TypeError('Pipe builder must expose use');
  }

  return Reflect.apply(use, builder, [middleware]);
}

function createAtRuntime(builder: object, initialState: unknown): object {
  const create = Reflect.get(builder, 'create');
  if (typeof create !== 'function') {
    throw new TypeError('Pipe builder must expose create');
  }

  const store = Reflect.apply(create, builder, [initialState]);
  if (typeof store !== 'object' || store === null) {
    throw new TypeError('Pipe builder must create a Store object');
  }
  return store;
}

function expectConflict(action: () => void, middleware: string, conflict: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PipeConfigurationError);
    if (error instanceof PipeConfigurationError) {
      expect(error.code).toBe('MIDDLEWARE_CONFLICT');
      expect(error.id).toBe(middleware);
      expect(error.ids).toEqual([middleware, conflict]);
      return;
    }
    throw error;
  }

  throw new TypeError('Expected pipe middleware conflict');
}

test('Given history controls, when setup succeeds, then every control is an immutable enumerable own value property', () => {
  // Given / When
  const store = pipe.use(history()).create({ value: 0 });

  // Then
  expect(Object.keys(store)).toEqual(expect.arrayContaining(controlKeys));
  for (const key of controlKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(store, key);
    expect(descriptor).toEqual({
      configurable: false,
      enumerable: true,
      value: store[key],
      writable: false,
    });
    expect(typeof store[key]).toBe('function');
  }
});

test('Given invalid limits, when history is requested, then it rejects before controls are installed', () => {
  // Given / When / Then
  for (const limit of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(() => history({ limit })).toThrow(RangeError);
  }
});

test('history: an existing control property -> rejects setup without overwriting the property', () => {
  for (const key of controlKeys) {
    const store = new Store({ value: 0 });
    const existing = () => undefined;
    Object.defineProperty(store, key, { value: existing });

    expect(() => history()(store)).toThrow(HistoryConfigurationError);

    expect(Reflect.get(store, key)).toBe(existing);
    store.set({ value: 1 });
    expect(store.getState()).toEqual({ value: 1 });
  }
});

test('history: only one selection hook supplied at runtime -> rejects the incomplete restoration contract', () => {
  expect(() => Reflect.apply(history, undefined, [{ select: (state: number) => state }])).toThrow(TypeError);
  expect(() => Reflect.apply(history, undefined, [{ restore: (_state: number, next: number) => next }])).toThrow(TypeError);
});

test('Given history pipe metadata, when it is registered and composed, then capability shape and duplicate policy are exact', () => {
  // Given
  const middleware = history({ limit: 1 });

  // When
  const metadata = getPipeableMiddlewareMetadata(middleware);
  const store = createAtRuntime(pipe.use(middleware), 0);

  // Then
  expect(metadata).toEqual({
    adds: ['@ilokesto/state/history-controls'],
    after: [],
    before: [],
    conflicts: [],
    duplicate: 'reject',
    id: '@ilokesto/state/history',
    requires: [],
  });
  const canUndo = Reflect.get(store, 'canUndo');
  expect(typeof canUndo).toBe('function');
  expect(Reflect.apply(canUndo, store, [])).toBeFalse();
  expect(() => useAtRuntime(useAtRuntime(pipe, history()), history())).toThrow(
    expect.objectContaining({ code: 'DUPLICATE_MIDDLEWARE' }),
  );
});

test('history: timers in either pipe order -> commit and replay without a metadata conflict', () => {
  jest.useFakeTimers();
  try {
    for (const timing of [debounce(10), throttle(10)]) {
      const stores = [
        pipe.use(history()).use(timing).create({ count: 0 }),
        pipe.use(timing).use(history()).create({ count: 0 }),
      ];
      for (const store of stores) {
        store.set({ count: 1 });
        jest.advanceTimersByTime(10);
        store.undo();
        expect(store.getState()).toEqual({ count: 0 });
        store.redo();
        expect(store.getState()).toEqual({ count: 1 });
        dispose(store);
      }
    }
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('pipe: explicitly conflicting custom middleware -> rejects either order before setup effects', () => {
  // Given
  jest.useFakeTimers();
  let throttleSetups = 0;
  const throttleMiddleware: PipeAnyMiddleware = (store) => {
    throttleSetups += 1;
    return store;
  };
  const source = definePipeableMiddleware(throttleMiddleware, {
    id: '@test/source', conflicts: ['@test/target'],
  } as const);
  const target = definePipeableMiddleware((store) => throttleMiddleware(store), {
    id: '@test/target',
  } as const);

  try {
    // When / Then
    expectConflict(
      () => useAtRuntime(useAtRuntime(pipe, source), target),
      '@test/source', '@test/target',
    );
    expectConflict(
      () => useAtRuntime(useAtRuntime(pipe, target), source),
      '@test/source', '@test/target',
    );
    expect(throttleSetups).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
