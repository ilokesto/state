import { expect, jest, spyOn, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { dispose, throttle } from '../src/middleware';
import { PipeConfigurationError } from '../src/utils/pipe/errors';
import { getPipeableMiddlewareMetadata } from '../src/utils/pipe/metadata';
import { pipe } from '../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

function useAtRuntime(builder: object, middleware: object): object {
  const use = Reflect.get(builder, 'use');
  if (typeof use !== 'function') {
    throw new TypeError('Pipe builder must expose use');
  }

  return Reflect.apply(use, builder, [middleware]);
}

test('Given a throttled Store via pipe, when updates arrive during and after its wait window, then it commits only leading updates synchronously', () => {
  // Given
  jest.useFakeTimers();
  const store = pipe.use(throttle(25)).create<CounterState>({ count: 0 });
  const clearTimeoutSpy = spyOn(globalThis, 'clearTimeout');
  let droppedUpdaterCalls = 0;

  try {
    // When
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    store.setState(() => {
      droppedUpdaterCalls += 1;
      return { count: 3 };
    });
    jest.advanceTimersByTime(24);

    // Then
    expect(store.getState()).toEqual({ count: 1 });
    expect(droppedUpdaterCalls).toBe(0);

    // When
    jest.advanceTimersByTime(1);
    dispose(store);
    store.setState({ count: 4 });

    // Then
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(store.getState()).toEqual({ count: 4 });
  } finally {
    clearTimeoutSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given curried throttles, when default and custom waits elapse, then they reopen exactly on expiry with no trailing commit', () => {
  // Given
  jest.useFakeTimers();
  const defaultStore = pipe.use(throttle()).create<CounterState>({ count: 0 });
  const customStore = pipe.use(throttle(10)).create<CounterState>({ count: 0 });

  try {
    // When
    defaultStore.setState({ count: 1 });
    defaultStore.setState({ count: 2 });
    customStore.setState({ count: 1 });
    customStore.setState({ count: 2 });
    jest.advanceTimersByTime(10);
    customStore.setState({ count: 3 });
    jest.advanceTimersByTime(289);

    // Then
    expect(defaultStore.getState()).toEqual({ count: 1 });
    expect(customStore.getState()).toEqual({ count: 3 });

    // When
    jest.advanceTimersByTime(1);
    defaultStore.setState({ count: 3 });

    // Then
    expect(defaultStore.getState()).toEqual({ count: 3 });
    expect(getPipeableMiddlewareMetadata(throttle(10))).toEqual({
      adds: ['@ilokesto/state/throttle-controls'],
      after: [],
      before: [],
      conflicts: [],
      duplicate: 'reject',
      id: '@ilokesto/state/throttle',
      requires: [],
    });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given a zero-wait throttle, when a second update occurs before queued timers run, then it remains closed until timer execution', () => {
  // Given
  jest.useFakeTimers();
  const store = pipe.use(throttle(0)).create<CounterState>({ count: 0 });

  try {
    // When
    store.setState({ count: 1 });
    store.setState({ count: 2 });

    // Then
    expect(store.getState()).toEqual({ count: 1 });

    // When
    jest.advanceTimersByTime(0);
    store.setState({ count: 3 });

    // Then
    expect(store.getState()).toEqual({ count: 3 });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given invalid waits or duplicate throttle middleware, when setup is attempted, then it rejects before Store or timer effects', () => {
  // Given
  jest.useFakeTimers();
  const store = new Store<CounterState>({ count: 0 });
  const pushMiddlewareSpy = spyOn(store, 'pushMiddleware');
  const timeoutSpy = spyOn(globalThis, 'setTimeout');

  try {
    // When / Then
    for (const wait of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => throttle(wait)).toThrow(RangeError);
    }
    expect(timeoutSpy).not.toHaveBeenCalled();
    expect(store.getState()).toEqual({ count: 0 });
    expect(() => useAtRuntime(useAtRuntime(pipe, throttle(10)), throttle(10))).toThrow(
      PipeConfigurationError,
    );
    expect(timeoutSpy).not.toHaveBeenCalled();
  } finally {
    timeoutSpy.mockRestore();
    pushMiddlewareSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given a throttled Store is disposed during a wait window, when it is updated again, then disposal clears the gate and later cycles remain disposable', () => {
  // Given
  jest.useFakeTimers();
  const store = pipe.use(throttle(25)).create<CounterState>({ count: 0 });

  try {
    // When
    store.setState({ count: 1 });
    store.setState({ count: 2 });
    dispose(store);
    store.setState({ count: 3 });
    dispose(store);
    jest.advanceTimersByTime(25);

    // Then
    expect(store.getState()).toEqual({ count: 3 });

    // When
    store.setState({ count: 4 });
    jest.advanceTimersByTime(25);
    dispose(store);

    // Then
    expect(store.getState()).toEqual({ count: 4 });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
