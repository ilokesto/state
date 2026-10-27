import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { registerStoreCleanup } from '../../src/lib/storeCleanup';
import { dispose } from '../../src/middleware';

function captureDisposeFailure<T>(store: Store<T>): AggregateError {
  try {
    dispose(store);
  } catch (error) {
    if (error instanceof AggregateError) {
      return error;
    }

    throw error;
  }

  throw new TypeError('Expected dispose to throw an AggregateError');
}

test('Given independent Stores, when each is disposed, then only its own cleanups run', () => {
  // Given
  const firstStore = new Store({ count: 0 });
  const secondStore = new Store({ count: 0 });
  const calls: string[] = [];
  registerStoreCleanup(firstStore, () => calls.push('first'));
  registerStoreCleanup(secondStore, () => calls.push('second'));

  // When
  dispose(firstStore);

  // Then
  expect(calls).toEqual(['first']);

  dispose(secondStore);
  expect(calls).toEqual(['first', 'second']);
});

test('Given a cleanup unregistered before disposal, when the Store is disposed, then it does not run', () => {
  // Given
  const store = new Store({ count: 0 });
  const cleanup = () => {
    throw new Error('unregistered cleanup ran');
  };
  const unregister = registerStoreCleanup(store, cleanup);
  unregister();
  unregister();

  // When
  dispose(store);

  // Then
  expect(store.getState()).toEqual({ count: 0 });
});

test('Given an earlier cleanup unregisters a later cleanup, when the Store is disposed, then the later cleanup is skipped', () => {
  // Given
  const store = new Store({ count: 0 });
  const calls: string[] = [];
  let unregisterLater: () => void = () => undefined;
  registerStoreCleanup(store, () => {
    calls.push('first');
    unregisterLater();
  });
  unregisterLater = registerStoreCleanup(store, () => calls.push('later'));

  // When
  dispose(store);

  // Then
  expect(calls).toEqual(['first']);
});

test('Given a disposed Store, when disposal is repeated and a new cleanup is registered, then each active cleanup runs once', () => {
  // Given
  const store = new Store({ count: 0 });
  const calls: string[] = [];
  registerStoreCleanup(store, () => calls.push('first'));

  // When
  dispose(store);
  dispose(store);
  registerStoreCleanup(store, () => calls.push('second'));
  dispose(store);

  // Then
  expect(calls).toEqual(['first', 'second']);
});

test('Given cleanups that throw Error and non-Error values, when the Store is disposed, then all run and failures are aggregated in order', () => {
  // Given
  const store = new Store({ count: 0 });
  const calls: string[] = [];
  const firstFailure = new Error('first failure');
  const secondFailure = 'second failure';
  const thirdFailure = { reason: 'third failure' };
  registerStoreCleanup(store, () => {
    calls.push('first');
    throw firstFailure;
  });
  registerStoreCleanup(store, () => {
    calls.push('second');
    throw secondFailure;
  });
  registerStoreCleanup(store, () => {
    calls.push('third');
    throw thirdFailure;
  });
  registerStoreCleanup(store, () => calls.push('fourth'));

  // When
  const failure = captureDisposeFailure(store);

  // Then
  expect(calls).toEqual(['first', 'second', 'third', 'fourth']);
  expect(failure.errors).toEqual([firstFailure, secondFailure, thirdFailure]);
  expect(failure.errors[0]).toBe(firstFailure);
  expect(failure.errors[2]).toBe(thirdFailure);
});
