import { expect, test } from 'bun:test';
import { dispose, persist, validate } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from '../fixtures/helpers/persistStorage';

class EventStorage extends AsyncMemoryStorage {
  readonly listeners = new Set<() => void>();
  subscribe(_key: string, listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  invalidate(): void { for (const listener of this.listeners) listener(); }
}

const create = (adapter: AsyncMemoryStorage) => pipe.use(persist({
  key: 'counter', storage: () => adapter, decode: decodeCounter,
})).create({ count: 0 });

test('automatic sync: event cleanup throws -> persistence still reaches terminal disposal', async () => {
  const adapter = new EventStorage();
  const failure = new Error('event cleanup failed');
  let adapterDisposed = false;
  adapter.subscribe = (_key, listener) => {
    adapter.listeners.add(listener);
    return () => {
      adapter.listeners.delete(listener);
      throw failure;
    };
  };
  adapter.dispose = () => { adapterDisposed = true; };
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, sync: {},
  })).create({ count: 0 });
  await store.persist.rehydrate();

  expect(() => dispose(store)).toThrow(AggregateError);

  expect(store.persist.getStatus().disposed).toBe(true);
  expect(adapterDisposed).toBe(true);
  expect(adapter.listeners.size).toBe(0);
  await expect(store.persist.flush()).rejects.toMatchObject({ code: 'DISPOSED' });
});

test('sync: later external value -> uses projection, migrations and full-state validation without echo', async () => {
  const adapter = new AsyncMemoryStorage();
  let validations = 0;
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter,
    project: (state: { count: number; transient: string }) => ({ count: state.count }),
    decode: decodeCounter,
    restore: (saved, current) => ({ ...current, ...saved }),
    migrate: [(value: unknown) => value],
  })).use(validate({
    '~standard': { vendor: 'test', version: 1, validate: (value: unknown) => {
      validations += 1;
      if (typeof value !== 'object' || value === null ||
        !('count' in value) || typeof value.count !== 'number' || value.count < 0 ||
        !('transient' in value) || typeof value.transient !== 'string') {
        return { issues: [{ message: 'invalid counter' }] };
      }
      return { value: { count: value.count, transient: value.transient } };
    } },
  })).create({ count: 0, transient: 'session' });
  await store.persist.rehydrate();
  validations = 0;
  adapter.value = { state: { count: 8 }, version: 0 };

  await store.persist.sync();

  expect(store.getState()).toEqual({ count: 8, transient: 'session' });
  expect(validations).toBe(1);
  expect(adapter.writes).toEqual([]);
  adapter.value = { state: { count: -1 }, version: 1 };
  await expect(store.persist.sync()).rejects.toMatchObject({ operation: 'sync', code: 'VALIDATION' });
  expect(store.getState().count).toBe(8);
  dispose(store);
});

for (const conflict of [undefined, 'keep-current', 'use-stored'] as const) {
  test(`sync: paused pending edits with ${conflict ?? 'no policy'} -> preserves the explicit conflict choice`, async () => {
    const adapter = new AsyncMemoryStorage();
    const store = create(adapter);
    await store.persist.rehydrate();
    store.persist.pause();
    store.set({ count: 2 });
    adapter.value = { state: { count: 9 }, version: 0 };

    const result = await store.persist.sync({ conflict }).catch((error: unknown) => error);

    if (conflict === undefined) expect(result).toMatchObject({ operation: 'sync', code: 'CONFLICT' });
    expect(store.getState().count).toBe(conflict === 'use-stored' ? 9 : 2);
    expect(store.persist.getStatus().pending).toBe(conflict !== 'use-stored');
    expect(adapter.writes).toEqual([]);
    await store.persist.flush();
    expect(adapter.value).toEqual({ state: { count: conflict === 'use-stored' ? 9 : 2 }, version: 0 });
    dispose(store);
  });
}

test('sync: local commit during read -> rejects even if the value was clean when read began', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = create(adapter);
  await store.persist.rehydrate();
  store.persist.pause();
  const started = deferred<void>();
  const read = deferred<unknown>();
  adapter.getItem = () => { started.resolve(); return read.promise; };
  const result = store.persist.sync().catch((error: unknown) => error);
  await started.promise;

  store.set({ count: 3 });
  read.resolve({ state: { count: 8 }, version: 0 });

  expect(await result).toMatchObject({ code: 'CONFLICT' });
  expect(store.getState().count).toBe(3);
  expect(store.persist.getStatus().pending).toBe(true);
  dispose(store);
});

test('sync: active write and queued flush -> waits for active I/O and rejects explicitly discarded edits', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = create(adapter);
  await store.persist.rehydrate();
  const started = deferred<void>();
  const release = deferred<void>();
  const operations: string[] = [];
  adapter.setItem = async (_key, value) => {
    operations.push('write');
    started.resolve();
    await release.promise;
    adapter.value = value;
  };
  store.set({ count: 1 });
  await started.promise;
  store.set({ count: 2 });
  const flushed = store.persist.flush().catch((error: unknown) => error);
  adapter.getItem = async () => {
    operations.push('read');
    return { state: { count: 8 }, version: 0 };
  };
  const synced = store.persist.sync({ conflict: 'use-stored' });
  expect(operations).toEqual(['write']);

  release.resolve();
  await synced;

  expect(await flushed).toMatchObject({ operation: 'sync', code: 'CONFLICT' });
  expect(operations).toEqual(['write', 'read']);
  expect(store.getState().count).toBe(8);
  expect(store.persist.getStatus().pending).toBe(false);
  dispose(store);
});

test('sync: superseded slow read -> newer read applies and releases saving without waiting for the old read', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = create(adapter);
  await store.persist.rehydrate();
  const started = deferred<void>();
  const stale = deferred<unknown>();
  adapter.getItem = () => { started.resolve(); return stale.promise; };
  const older = store.persist.sync();
  await started.promise;
  adapter.getItem = async () => ({ state: { count: 7 }, version: 0 });

  await store.persist.sync();
  await older;
  store.set({ count: 9 });
  await store.persist.flush();
  stale.resolve({ state: { count: 1 }, version: 0 });
  await stale.promise;

  expect(store.getState().count).toBe(9);
  expect(adapter.value).toEqual({ state: { count: 9 }, version: 0 });
  dispose(store);
});

for (const action of ['clear', 'dispose'] as const) {
  test(`sync: ${action} during unresolved read -> cancels immediately and ignores late restoration`, async () => {
    const adapter = new AsyncMemoryStorage();
    const store = create(adapter);
    await store.persist.rehydrate();
    const started = deferred<void>();
    const read = deferred<unknown>();
    adapter.getItem = () => { started.resolve(); return read.promise; };
    const synced = store.persist.sync().catch((error: unknown) => error);
    await started.promise;

    if (action === 'clear') await store.persist.clearStorage();
    else dispose(store);

    expect(await synced).toMatchObject({ code: action === 'clear' ? 'CLEARED' : 'DISPOSED' });
    read.resolve({ state: { count: 8 }, version: 0 });
    await read.promise;
    expect(store.getState().count).toBe(0);
    if (action === 'clear') {
      adapter.getItem = async () => adapter.value;
      await store.persist.sync();
      expect(store.getState().count).toBe(0);
    }
    dispose(store);
  });
}

test('sync: external deletion supersedes an earlier read -> retains memory without recreating storage', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = create(adapter);
  await store.persist.rehydrate();
  store.set({ count: 4 });
  await store.persist.flush();
  const started = deferred<void>();
  const stale = deferred<unknown>();
  adapter.getItem = () => { started.resolve(); return stale.promise; };
  const earlier = store.persist.sync();
  await started.promise;
  adapter.value = null;
  adapter.getItem = async () => null;

  await store.persist.sync();
  stale.resolve({ state: { count: 99 }, version: 0 });
  await earlier;

  expect(store.getState().count).toBe(4);
  expect(adapter.value).toBeNull();
  expect(adapter.writes).toHaveLength(1);
  dispose(store);
});

test('automatic sync: subscription invalidation -> restores once, reports rejection and unsubscribes on disposal', async () => {
  const adapter = new EventStorage();
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, sync: {},
  })).create({ count: 0 });
  expect(adapter.listeners.size).toBe(0);
  await store.persist.rehydrate();
  const restored = deferred<void>();
  const stop = store.subscribe(() => { if (store.getState().count === 5) restored.resolve(); });
  adapter.value = { state: { count: 5 }, version: 0 };

  adapter.invalidate();
  await restored.promise;

  expect(store.getState().count).toBe(5);
  expect(adapter.writes).toEqual([]);
  const failed = deferred<void>();
  store.persist.subscribe(status => { if (status.error?.code === 'INVALID_DATA') failed.resolve(); });
  adapter.value = { state: { count: 'invalid' }, version: 0 };
  adapter.invalidate();
  await failed.promise;
  expect(store.getState().count).toBe(5);
  expect(store.persist.getStatus().hydration).toBe('hydrated');
  stop();
  dispose(store);
  expect(adapter.listeners.size).toBe(0);
});

test('automatic sync: storage changes during hydration -> rereads after initial restoration', async () => {
  const adapter = new EventStorage();
  const started = deferred<void>();
  const first = deferred<unknown>();
  adapter.getItem = () => { started.resolve(); return first.promise; };
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, sync: {},
  })).create({ count: 0 });
  const restored = deferred<void>();
  store.subscribe(() => { if (store.getState().count === 6) restored.resolve(); });
  const hydration = store.persist.rehydrate();
  await started.promise;
  adapter.getItem = async () => ({ state: { count: 6 }, version: 0 });
  adapter.invalidate();

  first.resolve({ state: { count: 2 }, version: 0 });
  await hydration;
  await restored.promise;

  expect(store.getState().count).toBe(6);
  expect(adapter.writes).toEqual([]);
  dispose(store);
});

test('sync: unsupported automatic capability -> fails explicitly while manual reads remain supported', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter, sync: {},
  })).create({ count: 0 });
  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'STORAGE' });
  dispose(store);
  const manual = create(adapter);
  await expect(manual.persist.sync()).rejects.toMatchObject({ code: 'NOT_HYDRATED' });
  await manual.persist.rehydrate();
  adapter.value = { state: { count: 3 }, version: 0 };

  await manual.persist.sync();

  expect(manual.getState().count).toBe(3);
  dispose(manual);
  await expect(manual.persist.sync()).rejects.toMatchObject({ code: 'DISPOSED' });
});

test('sync: reentrant edit from restoration observer -> persists that edit rather than echoing restored state', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = create(adapter);
  await store.persist.rehydrate();
  store.subscribe(() => { if (store.getState().count === 7) store.set({ count: 8 }); });
  adapter.value = { state: { count: 7 }, version: 0 };

  await store.persist.sync();
  await store.persist.flush();

  expect(adapter.writes).toEqual([{ state: { count: 8 }, version: 0 }]);
  dispose(store);
});

test('sync: failed pending save -> conflict does not implicitly retry the failed write', async () => {
  const adapter = new AsyncMemoryStorage();
  let writes = 0;
  adapter.setItem = async () => { writes += 1; throw new Error('offline'); };
  const store = create(adapter);
  await store.persist.rehydrate();
  store.set({ count: 2 });
  await expect(store.persist.flush()).rejects.toMatchObject({ code: 'STORAGE' });
  adapter.value = { state: { count: 8 }, version: 0 };

  await expect(store.persist.sync()).rejects.toMatchObject({ code: 'CONFLICT' });

  expect(writes).toBe(1);
  expect(store.persist.getStatus().pending).toBe(true);
  expect(store.getState().count).toBe(2);
  dispose(store);
});

test('automatic sync: deletion during migrated hydration -> does not rewrite the stale initial value', async () => {
  const adapter = new EventStorage();
  const started = deferred<void>();
  const read = deferred<unknown>();
  adapter.getItem = () => { started.resolve(); return read.promise; };
  const store = pipe.use(persist({
    key: 'counter', storage: () => adapter, decode: decodeCounter,
    migrate: [(value: unknown) => value], sync: {},
  })).create({ count: 0 });
  const synced = deferred<void>();
  const hydration = store.persist.rehydrate();
  await started.promise;
  adapter.getItem = async () => { synced.resolve(); return null; };
  adapter.invalidate();

  read.resolve({ state: { count: 8 }, version: 0 });
  await hydration;
  await synced.promise;
  await store.persist.sync();

  expect(adapter.value).toBeNull();
  expect(adapter.writes).toEqual([]);
  expect(store.persist.getStatus().pending).toBe(false);
  dispose(store);
});
