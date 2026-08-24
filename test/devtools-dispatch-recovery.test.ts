import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { withBrowserFakes } from './helpers/browserFakes';
import { devtools } from '../src/middleware';
import { definePipeableMiddleware } from '../src/utils/pipe/metadata';
import { pipe } from '../src/utils/pipe/index';

type CounterState = {
  readonly count: number;
};

const createRejectFirstStateWrite = (failure: Error) => {
  let shouldThrow = true;

  return definePipeableMiddleware(
    <State>(store: Store<State>): Store<State> => {
      store.pushMiddleware((nextState, next) => {
        if (shouldThrow) {
          shouldThrow = false;
          throw failure;
        }

        next(nextState);
      });
      return store;
    },
    { id: '@test/reject-first-state-write' } as const,
  );
};

test('Given DevTools RESET and a once-throwing downstream middleware, when RESET fails then a later update succeeds, then DevTools sends the later update', () => {
  // Given
  withBrowserFakes<CounterState>((_, connections) => {
    const failure = new Error('RESET state write failed');
    const store = pipe
      .use(devtools('reset-recovery'))
      .use(createRejectFirstStateWrite(failure))
      .create<CounterState>({ count: 0 });
    const connection = connections[0];

    // When
    expect(() => connection.listener?.({ payload: { type: 'RESET' }, type: 'DISPATCH' })).toThrow(failure);
    store.setState({ count: 2 });

    // Then
    expect(connection.sends).toEqual([
      { action: 'reset-recovery:anonymous action', state: { count: 2 } },
    ]);
  });
});

test('Given DevTools ROLLBACK and a once-throwing downstream middleware, when ROLLBACK fails then a later update succeeds, then DevTools sends the later update', () => {
  // Given
  withBrowserFakes<CounterState>((_, connections) => {
    const failure = new Error('ROLLBACK state write failed');
    const store = pipe
      .use(devtools('rollback-recovery'))
      .use(createRejectFirstStateWrite(failure))
      .create<CounterState>({ count: 0 });
    const connection = connections[0];

    // When
    expect(() =>
      connection.listener?.({
        payload: { type: 'ROLLBACK' },
        state: JSON.stringify({ count: 1 }),
        type: 'DISPATCH',
      }),
    ).toThrow(failure);
    store.setState({ count: 2 });

    // Then
    expect(connection.sends).toEqual([
      { action: 'rollback-recovery:anonymous action', state: { count: 2 } },
    ]);
  });
});

test('Given a synchronous listener that dispatches ROLLBACK during DevTools RESET, when RESET completes then an ordinary update follows, then only the ordinary update is sent', () => {
  // Given
  withBrowserFakes<CounterState>((_, connections) => {
    const store = pipe.use(devtools('nested-dispatch-recovery')).create<CounterState>({ count: 0 });
    const connection = connections[0];
    let shouldRollback = true;
    store.setState({ count: 1 });
    connection.sends.length = 0;
    store.subscribe(() => {
      if (shouldRollback) {
        shouldRollback = false;
        connection.listener?.({
          payload: { type: 'ROLLBACK' },
          state: JSON.stringify({ count: 2 }),
          type: 'DISPATCH',
        });
      }
    });

    // When
    connection.listener?.({ payload: { type: 'RESET' }, type: 'DISPATCH' });
    store.setState({ count: 3 });

    // Then
    expect(store.getState()).toEqual({ count: 3 });
    expect(connection.sends).toEqual([
      { action: 'nested-dispatch-recovery:anonymous action', state: { count: 3 } },
    ]);
  });
});
