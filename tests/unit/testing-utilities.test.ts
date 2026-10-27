import { expect, test, spyOn } from 'bun:test';
import { createStore } from '@ilokesto/state';
import { memoryStorage, persist } from '@ilokesto/state/middleware';
import { createStoreTestHarness, pipe } from '@ilokesto/state/utils';
import type { PersistStorageFactory } from '@ilokesto/state/middleware';
import type { StoreTestHarness, StoreWaitOptions } from '@ilokesto/state/utils';

test('memoryStorage: shared factory -> cloned values and independent adapter disposal', async () => {
  const original = { state: { count: 2 }, version: 0 };
  const factory: PersistStorageFactory = memoryStorage([['a', original]]);
  const first = factory();
  const second = factory();
  original.state.count = 99;

  const read = await first.getItem('a');
  await first.setItem('b', { state: new Map([['count', 3]]), version: 1 });
  first.dispose?.();

  expect(read).toEqual({ state: { count: 2 }, version: 0 });
  expect(await second.getItem('b')).toEqual({ state: new Map([['count', 3]]), version: 1 });
  await expect(first.getItem('a')).rejects.toThrow('disposed');
  await expect(first.setItem('a', original)).rejects.toThrow('disposed');
  await expect(first.removeItem('a')).rejects.toThrow('disposed');
  await second.removeItem('a');
  expect(await second.getItem('a')).toBeNull();
  expect(await memoryStorage()().getItem('b')).toBeNull();
  second.dispose?.();
});

test('memoryStorage: writes and reads -> mutations cannot change stored snapshots', async () => {
  const storage = memoryStorage()();
  const value = { state: { count: 1 }, version: 0 };
  await storage.setItem('a', value);
  value.state.count = 9;
  const read = await storage.getItem('a') as typeof value;

  read.state.count = 8;

  expect(await storage.getItem('a')).toEqual({ state: { count: 1 }, version: 0 });
  await expect(storage.setItem('fn', { state: () => 1, version: 0 })).rejects.toThrow();
  expect(await storage.getItem('fn')).toBeNull();
});

test('createStoreTestHarness: persistence round trip -> waits resolve and cleanup disposes middleware', async () => {
  const storage = memoryStorage();
  const decode = (value: unknown) => typeof value === 'number' ? value : null;
  const store = pipe.use(persist({ key: 'counter', storage, decode })).create<number>(0);
  const harness: StoreTestHarness<number> = createStoreTestHarness(store);
  const options: StoreWaitOptions = { timeoutMs: 1000 };
  await store.persist.rehydrate();
  const completed = harness.waitFor(value => value === 2, options);

  store.set(2);

  expect(await completed).toBe(2);
  expect(await harness.waitFor(value => value === 2)).toBe(2);
  expect(harness.states).toEqual([0, 2]);
  await store.persist.flush();
  harness.dispose();
  harness.dispose();
  expect(store.persist.getStatus().disposed).toBe(true);
  store.set(3);
  expect(harness.states).toEqual([0, 2]);
  const restored = pipe.use(persist({ key: 'counter', storage, decode })).create<number>(0);
  const restoredHarness = createStoreTestHarness(restored);
  try {
    await restored.persist.rehydrate();
    expect(restored.getState()).toBe(2);
  } finally {
    restoredHarness.dispose();
  }
});

test('createStoreTestHarness: disposal -> pending and future waits reject without further predicate calls', async () => {
  const store = createStore(0);
  const harness = createStoreTestHarness(store);
  let calls = 0;
  const waiting = harness.waitFor(() => { calls += 1; return false; });
  const rejected = waiting.catch(error => error);

  harness.dispose();

  expect(await rejected).toMatchObject({ message: 'Store test harness is disposed' });
  store.set(1);
  expect(calls).toBe(1);
  await expect(harness.waitFor(() => true)).rejects.toThrow('disposed');
});

test('createStoreTestHarness: abort and predicate errors -> reject and detach each completed wait', async () => {
  const store = createStore(0);
  const harness = createStoreTestHarness(store);
  const controller = new AbortController();
  let calls = 0;
  const waiting = harness.waitFor(() => { calls += 1; return false; }, { signal: controller.signal });
  const rejected = waiting.catch(error => error);

  controller.abort('cancelled');

  expect(await rejected).toBe('cancelled');
  store.set(1);
  expect(calls).toBe(1);
  await expect(harness.waitFor(() => true, { signal: controller.signal })).rejects.toBe('cancelled');
  await expect(harness.waitFor(() => { throw new Error('predicate'); })).rejects.toThrow('predicate');
  await expect(harness.waitFor(() => false, { timeoutMs: Infinity })).rejects.toBeInstanceOf(RangeError);
  harness.dispose();
});

test('createStoreTestHarness: deadline signal -> rejects without polling or remaining predicate', async () => {
  const store = createStore(0);
  const harness = createStoreTestHarness(store);
  let fireDeadline: () => void = () => { throw new Error('deadline was not registered'); };
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
    fireDeadline = callback;
    return 0;
  }) as typeof setTimeout);
  let calls = 0;
  try {
    const waiting = harness.waitFor(() => { calls += 1; return false; });
    const rejected = waiting.catch(error => error);

    fireDeadline();

    expect(await rejected).toMatchObject({ message: 'Store state condition timed out' });
    store.set(1);
    expect(calls).toBe(1);
  } finally {
    timer.mockRestore();
    harness.dispose();
  }
});

test('createStoreTestHarness: successful wait -> releases deadline and abort listener', async () => {
  const store = createStore(0);
  const harness = createStoreTestHarness(store);
  const controller = new AbortController();
  const removeListener = spyOn(controller.signal, 'removeEventListener');
  const clearDeadline = spyOn(globalThis, 'clearTimeout');
  try {
    const completed = harness.waitFor(value => value === 1, { signal: controller.signal });

    store.set(1);

    expect(await completed).toBe(1);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(clearDeadline).toHaveBeenCalledTimes(1);
    const snapshots = harness.states as number[];
    snapshots.push(999);
    expect(harness.states).toEqual([0, 1]);
  } finally {
    removeListener.mockRestore();
    clearDeadline.mockRestore();
    harness.dispose();
  }
});

test('createStoreTestHarness: future predicate throws -> other waits and store notifications continue', async () => {
  const store = createStore(0);
  const harness = createStoreTestHarness(store);
  const failed = harness.waitFor(value => {
    if (value === 1) {
      throw new Error('future predicate');
    }
    return false;
  }).catch(error => error);
  const completed = harness.waitFor(value => value === 2);
  try {
    store.set(1);
    store.set(2);

    expect(await failed).toMatchObject({ message: 'future predicate' });
    expect(await completed).toBe(2);
    expect(harness.states).toEqual([0, 1, 2]);
  } finally {
    harness.dispose();
  }
});
