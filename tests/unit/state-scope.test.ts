import { expect, test } from 'bun:test';
import { createScope, createStore, dispose } from '../../src';
import { registerStoreCleanup } from '../../src/lib/storeCleanup';

test('scope.dispose: owned and borrowed stores -> only owned middleware is released once', () => {
  const owner = createScope();
  const consumer = createScope();
  const calls: string[] = [];
  const store = owner.create(() => createStore({ count: 1 }));
  registerStoreCleanup(store, () => calls.push('owned'));
  const borrowed = consumer.borrow(store);
  consumer.dispose();

  expect(borrowed).toBe(store);
  expect(calls).toEqual([]);
  owner.dispose();
  owner.dispose();
  expect(calls).toEqual(['owned']);
  expect(owner.disposed).toBe(true);
});

test('scope.dispose: throwing cleanups -> reverse acquisition order and all failures reported', () => {
  const scope = createScope();
  const calls: number[] = [];
  for (const count of [1, 2, 3]) {
    const store = scope.create(() => createStore({ count }));
    registerStoreCleanup(store, () => {
      calls.push(count);
      if (count !== 2) throw count;
    });
  }
  let failure: unknown;

  try { scope.dispose(); } catch (error) { failure = error; }

  expect(calls).toEqual([3, 2, 1]);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Missing cleanup failure');
  expect(failure.errors.map(error => error.errors)).toEqual([[3], [1]]);
  expect(() => scope.dispose()).not.toThrow();
});

test('scope.create: duplicate and conflicting ownership -> no double disposal or ownership theft', () => {
  const owner = createScope();
  const other = createScope();
  const store = owner.create(() => createStore(1));
  let disposed = 0;
  registerStoreCleanup(store, () => disposed++);

  expect(owner.create(() => store)).toBe(store);
  expect(() => other.create(() => store)).toThrow('another state scope');
  other.dispose();
  expect(disposed).toBe(0);
  owner.dispose();
  expect(disposed).toBe(1);
  expect(() => createScope().create(() => store)).toThrow('another state scope');
});

test('scope.create: closed scope -> factory is not called and borrowing is rejected', () => {
  const scope = createScope();
  const store = createStore(1);
  scope.dispose();
  let calls = 0;

  expect(() => scope.create(() => { calls++; return store; })).toThrow('disposed');

  expect(calls).toBe(0);
  expect(() => scope.borrow(store)).toThrow('disposed');
});

test('scope.create: scope closes during factory -> returned store is cleaned up', () => {
  const scope = createScope();
  let cleaned = false;

  expect(() => scope.create(() => {
    const store = createStore(1);
    registerStoreCleanup(store, () => { cleaned = true; });
    scope.dispose();
    return store;
  })).toThrow('disposed during');

  expect(cleaned).toBe(true);
});

test('scope.create: factory throws -> existing ownership remains usable', () => {
  const scope = createScope();
  const owned = scope.create(() => createStore(1));
  let cleaned = false;
  registerStoreCleanup(owned, () => { cleaned = true; });

  expect(() => scope.create(() => { throw new Error('construction'); })).toThrow('construction');

  expect(scope.disposed).toBe(false);
  scope.dispose();
  expect(cleaned).toBe(true);
});

test('scope.dispose: consumer subscriptions -> lifecycle remains the consumer responsibility', () => {
  const scope = createScope();
  const store = scope.create(() => createStore(1));
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);

  scope.dispose();
  store.set(2);

  expect(notifications).toBe(1);
  unsubscribe();
  store.set(3);
  expect(notifications).toBe(1);
  dispose(store);
});
