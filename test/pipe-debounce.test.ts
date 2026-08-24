import { expect, jest, spyOn, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { debounce } from '../src/middleware';
import { pipe } from '../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

test('Given invalid debounce waits, when the middleware factory is called, then each rejects before Store or timer effects', () => {
  // Given
  jest.useFakeTimers();
  const pushMiddlewareSpy = spyOn(Store.prototype, 'pushMiddleware');
  const timeoutSpy = spyOn(globalThis, 'setTimeout');

  try {
    // When / Then
    for (const wait of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => debounce(wait)).toThrow(RangeError);
    }
    expect(pushMiddlewareSpy).not.toHaveBeenCalled();
    expect(timeoutSpy).not.toHaveBeenCalled();
  } finally {
    timeoutSpy.mockRestore();
    pushMiddlewareSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('Given a zero-wait debounce, when an update is scheduled, then it commits when queued timers run', () => {
  // Given
  jest.useFakeTimers();
  const store = pipe.use(debounce(0)).create<CounterState>({ count: 0 });

  try {
    // When
    store.setState({ count: 1 });

    // Then
    expect(store.getState()).toEqual({ count: 0 });

    // When
    jest.advanceTimersByTime(0);

    // Then
    expect(store.getState()).toEqual({ count: 1 });
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
