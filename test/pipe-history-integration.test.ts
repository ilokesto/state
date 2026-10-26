import { expect, jest, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { debounce, dispose, history, throttle } from '../src/middleware';
import { definePipeableMiddleware, getPipeableMiddlewareMetadata } from '../src/utils/pipe/metadata';
import { pipe } from '../src/utils/pipe';

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

test('history and timer metadata: compatible chains -> expose controls while provider and duplicate constraints remain enforced', () => {
  // Given
  jest.useFakeTimers();
  let observedUndo = false;
  const historyConsumer = definePipeableMiddleware(
    <State>(store: Store<State>): Store<State> => {
      observedUndo = typeof Reflect.get(store, 'undo') === 'function';
      return store;
    },
    {
      id: '@test/history-consumer',
      requires: [
        {
          id: '@ilokesto/state/history-controls',
          shape: {
            canRedo: () => false,
            canUndo: () => false,
            clearHistory: () => undefined,
            redo: () => undefined,
            undo: () => undefined,
          },
        },
      ],
    } as const,
  );

  try {
    // When
    const store = pipe.use(history()).use(historyConsumer).create({ count: 0 });

    // Then
    expect(getPipeableMiddlewareMetadata(history())).toEqual({
      adds: ['@ilokesto/state/history-controls'],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/history',
      requires: [],
    });
    expect(getPipeableMiddlewareMetadata(throttle(10))).toEqual({
      adds: ['@ilokesto/state/throttle-controls'],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/throttle',
      requires: [],
    });
    expect(observedUndo).toBeTrue();
    expect(typeof store.undo).toBe('function');
    expect(() => useAtRuntime(pipe, historyConsumer)).toThrow(
      expect.objectContaining({ code: 'MISSING_CAPABILITY', id: '@test/history-consumer' }),
    );
    expect(() => useAtRuntime(useAtRuntime(pipe, history()), history())).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_MIDDLEWARE', id: '@ilokesto/state/history' }),
    );
    for (const delayed of [debounce(10), throttle(10)]) {
      const timed = pipe.use(history()).use(delayed).create({ count: 0 });
      timed.set({ count: 1 });
      jest.advanceTimersByTime(10);
      timed.undo();
      expect(timed.getState()).toEqual({ count: 0 });
      dispose(timed);
    }
    dispose(store);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
