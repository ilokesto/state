import { expect, test } from 'bun:test';

import { restoreBrowserGlobal } from '../fixtures/helpers/browserFakes';
import { devtools, dispose } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';

type CounterState = {
  readonly count: number;
};

test('Given multiple DevTools listeners on separate Stores, when Stores are disposed, then each listener unsubscribes once and failures do not skip later cleanup', () => {
  // Given
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const unsubscribeCalls: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: ({ name }: { readonly name: string }) => ({
          init: () => undefined,
          send: () => undefined,
          subscribe: () => () => {
            unsubscribeCalls.push(name);
            if (name === 'first') {
              throw new Error('first unsubscribe failed');
            }
          },
        }),
      },
    },
  });
  const firstStore = pipe.use(devtools('first')).create<CounterState>({ count: 0 });
  const independentStore = pipe.use(devtools('independent')).create<CounterState>({ count: 0 });

  try {
    // When
    expect(() => dispose(firstStore)).toThrow(AggregateError);
    dispose(independentStore);

    // Then
    expect(unsubscribeCalls).toEqual(['first', 'independent']);
  } finally {
    restoreBrowserGlobal('window', windowDescriptor);
  }
});

test('Given pipe-created DevTools stores, when one Store is disposed, then its cleanup is isolated and idempotent', () => {
  // Given
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const unsubscribeCalls: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: ({ name }: { readonly name: string }) => ({
          init: () => undefined,
          send: () => undefined,
          subscribe: () => () => unsubscribeCalls.push(name),
        }),
      },
    },
  });

  try {
    const first = pipe.use(devtools('pipe-first')).create<CounterState>({ count: 0 });
    const second = pipe.use(devtools('pipe-second')).create<CounterState>({ count: 0 });

    // When
    dispose(first);
    dispose(first);

    // Then
    expect(unsubscribeCalls).toEqual(['pipe-first']);

    // When
    dispose(second);

    // Then
    expect(unsubscribeCalls).toEqual(['pipe-first', 'pipe-second']);
  } finally {
    restoreBrowserGlobal('window', windowDescriptor);
  }
});
