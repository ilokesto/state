import { expect, test } from 'bun:test';
import { dispose, persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from './helpers/persistStorage';

test('persist creation: lazy factory -> no storage access until explicit hydration', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 7 }, version: 0 };
  let factories = 0;
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => { factories += 1; return adapter; },
  })).create({ count: 0 });

  expect(factories).toBe(0);
  expect(adapter.reads).toBe(0);
  expect(store.persist.getStatus().hydration).toBe('idle');
  expect(store.getState()).toEqual({ count: 0 });
  await store.persist.rehydrate();

  expect(store.getState()).toEqual({ count: 7 });
  expect(factories).toBe(1);
  expect(store.persist.getStatus().hydration).toBe('hydrated');
  expect(adapter.writes).toEqual([]);
});

test('rehydrate: concurrent calls and success -> one shared operation and no replay', async () => {
  const read = deferred<unknown>();
  const started = deferred<void>();
  const adapter = new AsyncMemoryStorage();
  adapter.getItem = () => { started.resolve(); return read.promise; };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });

  const first = store.persist.rehydrate();
  expect(store.persist.rehydrate()).toBe(first);
  await started.promise;
  read.resolve({ state: { count: 8 }, version: 0 });
  await first;
  store.set({ count: 9 });
  await store.persist.rehydrate();
  await store.persist.flush();

  expect(store.getState()).toEqual({ count: 9 });
  expect(adapter.value).toEqual({ state: { count: 9 }, version: 0 });
});

for (const duringRead of [false, true]) {
  test(`rehydrate: edits ${duringRead ? 'during read' : 'before call'} -> conflict preserves both values`, async () => {
    const adapter = new AsyncMemoryStorage();
    const read = deferred<unknown>();
    const started = deferred<void>();
    adapter.value = { state: { count: 4 }, version: 0 };
    adapter.getItem = () => { started.resolve(); return read.promise; };
    const store = pipe.use(persist({
      key: 'counter', decode: decodeCounter, storage: () => adapter,
    })).create({ count: 0 });
    if (!duringRead) store.set({ count: 6 });

    const hydration = store.persist.rehydrate();
    const rejection = hydration.catch((error: unknown) => error);
    await started.promise;
    if (duringRead) store.set({ count: 6 });
    read.resolve(adapter.value);
    expect(await rejection).toMatchObject({ code: 'CONFLICT' });

    expect(store.getState()).toEqual({ count: 6 });
    expect(adapter.value).toEqual({ state: { count: 4 }, version: 0 });
    expect(adapter.writes).toEqual([]);
    expect(store.persist.getStatus()).toMatchObject({ hydration: 'conflict', pending: true });
  });
}

for (const conflict of ['keep-current', 'use-stored'] as const) {
  test(`rehydrate: explicit ${conflict} -> resolves conflict without implicit merge`, async () => {
    const adapter = new AsyncMemoryStorage();
    adapter.value = { state: { count: 4 }, version: 0 };
    const store = pipe.use(persist({
      key: 'counter', decode: decodeCounter, storage: () => adapter,
    })).create({ count: 0 });
    store.set({ count: 6 });
    await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'CONFLICT' });

    await store.persist.rehydrate({ conflict });
    await store.persist.flush();

    const count = conflict === 'keep-current' ? 6 : 4;
    expect(store.getState()).toEqual({ count });
    expect(adapter.value).toEqual({ state: { count }, version: 0 });
    expect(store.persist.getStatus().pending).toBe(false);
  });
}

test('rehydrate: conflict policy without edits -> still restores the stored value', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });

  await store.persist.rehydrate({ conflict: 'keep-current' });

  expect(store.getState()).toEqual({ count: 4 });
  expect(adapter.writes).toEqual([]);
});

test('persist: factory shared across stores -> owns independent reusable instances', async () => {
  const instances: AsyncMemoryStorage[] = [];
  const storage = () => {
    const adapter = new AsyncMemoryStorage();
    instances.push(adapter);
    return adapter;
  };
  const configured = persist({ key: 'counter', decode: decodeCounter, storage });
  const first = pipe.use(configured).create({ count: 0 });
  const second = pipe.use(configured).create({ count: 0 });

  await Promise.all([first.persist.rehydrate(), second.persist.rehydrate()]);
  first.set({ count: 1 });
  await first.persist.flush();
  first.set({ count: 2 });
  await first.persist.flush();
  dispose(first);
  second.set({ count: 3 });
  await second.persist.flush();

  expect(instances).toHaveLength(2);
  expect(instances[0]?.disposals).toBe(1);
  expect(instances[1]?.disposals).toBe(0);
  expect(instances[1]?.value).toEqual({ state: { count: 3 }, version: 0 });
});

test('flush: before hydration -> rejects without activating storage', async () => {
  let factories = 0;
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter,
    storage: () => { factories += 1; return new AsyncMemoryStorage(); },
  })).create({ count: 0 });
  store.set({ count: 1 });

  await expect(store.persist.flush()).rejects.toMatchObject({ code: 'NOT_HYDRATED' });

  expect(factories).toBe(0);
});
