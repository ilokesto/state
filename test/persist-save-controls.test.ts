import { expect, jest, test } from 'bun:test';
import { dispose, persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from './helpers/persistStorage';

test('pause: synchronous commits -> retains latest value and flush bypasses pause without resuming', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({ key: 'counter', storage: () => adapter, decode: decodeCounter }))
    .create({ count: 0 });
  store.persist.pause();
  await store.persist.rehydrate();

  store.set({ count: 1 });
  store.set({ count: 2 });
  expect(store.getState()).toEqual({ count: 2 });
  expect(adapter.writes).toEqual([]);
  await store.persist.flush();
  store.set({ count: 3 });

  expect(adapter.value).toEqual({ state: { count: 2 }, version: 0 });
  expect(store.persist.getStatus()).toMatchObject({ pending: true, paused: true });
  const saved = deferred<void>();
  const stop = store.persist.subscribe(status => { if (!status.pending) saved.resolve(); });
  store.persist.resume();
  await saved.promise;
  stop();
  expect(adapter.value).toEqual({ state: { count: 3 }, version: 0 });
});

test('pause: active write and captured flush -> completes the target without saving later paused edits', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  adapter.setItem = async (_key, value) => { started.resolve(); await release.promise; adapter.value = value; };
  const store = pipe.use(persist({ key: 'counter', storage: () => adapter, decode: decodeCounter }))
    .create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });
  await started.promise;
  const flushed = store.persist.flush();

  store.persist.pause();
  store.set({ count: 2 });
  release.resolve();
  await flushed;

  expect(adapter.value).toEqual({ state: { count: 1 }, version: 0 });
  expect(store.persist.getStatus()).toMatchObject({ pending: true, paused: true, saving: 'idle' });
  dispose(store);
});

test('retry: failed write while paused -> retries once without enabling automatic saving', async () => {
  const adapter = new AsyncMemoryStorage();
  let attempts = 0;
  adapter.setItem = async (_key, value) => {
    if (++attempts === 1) throw new Error('offline');
    adapter.value = value;
  };
  const store = pipe.use(persist({ key: 'counter', storage: () => adapter, decode: decodeCounter }))
    .create({ count: 0 });
  await expect(store.persist.retry()).rejects.toMatchObject({ code: 'NOT_HYDRATED' });
  await store.persist.rehydrate();
  store.persist.pause();
  store.set({ count: 1 });
  await expect(store.persist.retry()).rejects.toMatchObject({ code: 'STORAGE' });

  await store.persist.retry();

  expect(attempts).toBe(2);
  expect(store.persist.getStatus()).toMatchObject({ pending: false, paused: true, error: null });
});

test('clearStorage: paused flush during active write -> cancels old target and orders new saves after deletion', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  const operations: string[] = [];
  adapter.setItem = async (_key, value) => {
    operations.push(`write:${JSON.stringify(value.state)}`);
    if (operations.length === 1) { started.resolve(); await release.promise; }
    adapter.value = value;
  };
  adapter.removeItem = async () => { operations.push('remove'); adapter.value = null; };
  const store = pipe.use(persist({ key: 'counter', storage: () => adapter, decode: decodeCounter }))
    .create({ count: 0 });
  await store.persist.rehydrate();
  store.persist.pause();
  store.set({ count: 1 });
  const oldFlush = store.persist.flush().catch((error: unknown) => error);
  await started.promise;

  const cleared = store.persist.clearStorage();
  store.set({ count: 2 });
  const newFlush = store.persist.retry();
  release.resolve();
  expect(await oldFlush).toMatchObject({ code: 'CLEARED' });
  await Promise.all([cleared, newFlush]);

  expect(operations).toEqual(['write:{"count":1}', 'remove', 'write:{"count":2}']);
  expect(store.persist.getStatus()).toMatchObject({ pending: false, paused: true });
});

test('saveDebounceMs: successive commits -> delays saving only and resets the quiet interval', async () => {
  jest.useFakeTimers();
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, saveDebounceMs: 100,
  })).create({ count: 0 });
  try {
    await store.persist.rehydrate();
    store.set({ count: 1 });
    jest.advanceTimersByTime(75);
    store.set({ count: 2 });
    jest.advanceTimersByTime(75);
    expect(store.getState()).toEqual({ count: 2 });
    expect(adapter.writes).toEqual([]);
    const saved = deferred<void>();
    store.persist.subscribe(status => { if (!status.pending) saved.resolve(); });

    jest.advanceTimersByTime(25);
    await saved.promise;

    expect(adapter.writes).toEqual([{ state: { count: 2 }, version: 0 }]);
  } finally {
    dispose(store);
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('saveDebounceMs: flush clear and disposal -> bypasses or cancels pending save timers', async () => {
  jest.useFakeTimers();
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, saveDebounceMs: 100,
  })).create({ count: 0 });
  try {
    await store.persist.rehydrate();
    store.set({ count: 1 });
    await store.persist.flush();
    expect(adapter.writes).toHaveLength(1);
    store.set({ count: 2 });
    await store.persist.clearStorage();
    jest.advanceTimersByTime(100);
    expect(adapter.value).toBeNull();
    store.set({ count: 3 });
    store.persist.pause();
    jest.advanceTimersByTime(100);
    expect(adapter.writes).toHaveLength(1);
    store.persist.resume();
    dispose(store);

    jest.advanceTimersByTime(100);

    expect(adapter.writes).toHaveLength(1);
    await expect(store.persist.retry()).rejects.toMatchObject({ code: 'DISPOSED' });
    expect(() => store.persist.pause()).toThrow();
    expect(() => store.persist.resume()).toThrow();
  } finally {
    dispose(store);
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('saveDebounceMs: invalid duration -> rejects configuration before adapter access', () => {
  const adapter = new AsyncMemoryStorage();

  for (const saveDebounceMs of [-1, NaN, Infinity, 2_147_483_648]) {
    expect(() => persist({ key: 'counter', storage: () => adapter, decode: decodeCounter, saveDebounceMs }))
      .toThrow(RangeError);
  }

  expect(adapter.reads).toBe(0);
});

test('dispose: paused retry active with clear queued -> rejects both obligations and ignores late completion', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  adapter.setItem = async () => { started.resolve(); await release.promise; };
  const store = pipe.use(persist({ key: 'counter', storage: () => adapter, decode: decodeCounter }))
    .create({ count: 0 });
  await store.persist.rehydrate();
  store.persist.pause();
  store.set({ count: 1 });
  const retry = store.persist.retry().catch((error: unknown) => error);
  await started.promise;
  const clear = store.persist.clearStorage().catch((error: unknown) => error);
  store.set({ count: 2 });
  const latest = store.persist.retry().catch((error: unknown) => error);

  dispose(store);
  release.resolve();

  expect(await retry).toMatchObject({ code: 'CLEARED' });
  expect(await clear).toMatchObject({ code: 'DISPOSED' });
  expect(await latest).toMatchObject({ code: 'DISPOSED' });
  expect(adapter.removes).toBe(0);
  expect(store.persist.getStatus()).toMatchObject({ disposed: true, pending: false, saving: 'idle' });
});
