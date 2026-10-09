import { expect, test } from 'bun:test';
import { dispose, history, persist, validate } from '../src/middleware';
import type { PersistStatus } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from './helpers/persistStorage';

test('rehydrate: factory failure -> records cause and retries factory only until created', async () => {
  const failure = new Error('unavailable');
  const adapter = new AsyncMemoryStorage();
  let factories = 0;
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter,
    storage: () => { if (++factories === 1) throw failure; return adapter; },
  })).create({ count: 0 });
  const observed: PersistStatus[] = [];
  store.persist.subscribe(status => observed.push(status));

  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'STORAGE', cause: failure });
  await store.persist.rehydrate();
  store.set({ count: 2 });
  await store.persist.flush();

  expect(factories).toBe(2);
  expect(observed.map(status => status.hydration)).toContain('error');
  expect(store.persist.getStatus().hydration).toBe('hydrated');
});

test('rehydrate: read failure -> preserves state and reuses the created adapter on retry', async () => {
  const adapter = new AsyncMemoryStorage();
  const failure = new Error('read failed');
  let factories = 0;
  let attempts = 0;
  adapter.getItem = async () => {
    if (++attempts === 1) throw failure;
    return { state: { count: 4 }, version: 0 };
  };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => { factories += 1; return adapter; },
  })).create({ count: 0 });

  await expect(store.persist.rehydrate()).rejects.toMatchObject({ cause: failure });
  expect(store.getState()).toEqual({ count: 0 });
  await store.persist.rehydrate();

  expect(factories).toBe(1);
  expect(store.getState()).toEqual({ count: 4 });
});

test('rehydrate: status subscriber reenters -> shares the already registered hydration', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  let nested: Promise<void> | undefined;
  store.persist.subscribe(status => {
    if (status.hydration === 'hydrating') nested = store.persist.rehydrate();
  });

  const first = store.persist.rehydrate();
  await first;

  expect(nested).toBe(first);
  expect(adapter.reads).toBe(1);
});

test('rehydrate: notification throws after commit -> succeeds once and exposes notification error', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  store.subscribe(() => { throw new Error('subscriber failed'); });

  await store.persist.rehydrate();
  await store.persist.rehydrate();

  expect(store.getState()).toEqual({ count: 4 });
  expect(adapter.reads).toBe(1);
  expect(store.persist.getStatus()).toMatchObject({
    hydration: 'hydrated', error: { operation: 'notify', code: 'NOTIFICATION' },
  });
});

test('rehydrate: restoration subscriber edits -> persists user commit and keeps restored history baseline', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(history()).use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  store.set({ count: 1 });
  const unsubscribe = store.subscribe(() => {
    if (store.getState().count === 4) store.set({ count: 5 });
  });

  await store.persist.rehydrate({ conflict: 'use-stored' });
  await store.persist.flush();
  expect(adapter.value).toEqual({ state: { count: 5 }, version: 0 });
  unsubscribe();
  store.undo();

  expect(store.getState()).toEqual({ count: 4 });
  expect(store.canUndo()).toBe(false);
});

for (const order of ['before', 'after'] as const) {
  test(`rehydrate: validate ${order} persist -> transforms once before restoration`, async () => {
    const adapter = new AsyncMemoryStorage();
    adapter.value = { state: { count: 4 }, version: 0 };
    let validations = 0;
    const validator = validate({
      '~standard': {
        version: 1, vendor: 'test',
        validate: (value: unknown) => {
          validations += 1;
          const decoded = decodeCounter(value);
          return decoded ? { value: { count: decoded.count + 1 } } : { issues: [{ message: 'invalid' }] };
        },
      },
    });
    const persistence = persist({ key: 'counter', decode: decodeCounter, storage: () => adapter });
    const store = order === 'before'
      ? pipe.use(validator).use(persistence).create({ count: 0 })
      : pipe.use(persistence).use(validator).create({ count: 0 });

    await store.persist.rehydrate();

    expect(store.getState()).toEqual({ count: 5 });
    expect(validations).toBe(1);
  });
}

test('rehydrate: state validation rejects -> no restoration or migration rewrite', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: -1 }, version: 0 };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter, migrate: [(value: unknown) => value],
  })).use(validate({
    '~standard': {
      version: 1, vendor: 'test',
      validate: (_value: unknown): { value: { count: number } } | { issues: { message: string }[] } =>
        ({ issues: [{ message: 'rejected' }] }),
    },
  }, { onError: () => undefined })).create({ count: 0 });

  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'VALIDATION' });

  expect(store.getState()).toEqual({ count: 0 });
  expect(adapter.writes).toEqual([]);
});

test('dispose: pending hydration -> rejects promptly and ignores late read completion', async () => {
  const read = deferred<unknown>();
  const started = deferred<void>();
  const adapter = new AsyncMemoryStorage();
  adapter.getItem = () => { started.resolve(); return read.promise; };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  const hydration = store.persist.rehydrate();
  const rejected = hydration.catch((error: unknown) => error);
  await started.promise;

  dispose(store);
  expect(await rejected).toMatchObject({ code: 'DISPOSED' });
  read.resolve({ state: { count: 9 }, version: 0 });
  await read.promise;
  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'DISPOSED' });

  expect(adapter.disposals).toBe(1);
  expect(store.getState()).toEqual({ count: 0 });
  expect(store.persist.getStatus().disposed).toBe(true);
});

test('clearStorage: outstanding hydration -> invalidates its late result and allows a fresh attempt', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const read = deferred<unknown>();
  let reads = 0;
  adapter.getItem = () => {
    if (++reads === 1) { started.resolve(); return read.promise; }
    return Promise.resolve(adapter.value);
  };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  const hydration = store.persist.rehydrate().catch((error: unknown) => error);
  await started.promise;

  await store.persist.clearStorage();
  expect(await hydration).toMatchObject({ code: 'CLEARED' });
  read.resolve({ state: { count: 9 }, version: 0 });
  await store.persist.rehydrate();

  expect(store.getState()).toEqual({ count: 0 });
  expect(store.persist.getStatus().hydration).toBe('hydrated');
  expect(adapter.value).toBe(null);
});

test('clearStorage: hydration not yet started -> cancels before opening the read', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });

  const hydration = store.persist.rehydrate().catch((error: unknown) => error);
  await store.persist.clearStorage();

  expect(await hydration).toMatchObject({ code: 'CLEARED' });
  expect(adapter.reads).toBe(0);
});

test('clearStorage: restoration notification clears migrated data -> retains hydration success without rewriting deletion', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
    migrate: [(value: unknown) => value],
  })).create({ count: 0 });
  let clearing: Promise<void> | undefined;
  store.subscribe(() => { clearing = store.persist.clearStorage(); });

  await store.persist.rehydrate();
  await clearing;
  await store.persist.flush();

  expect(store.getState()).toEqual({ count: 4 });
  expect(store.persist.getStatus().hydration).toBe('hydrated');
  expect(adapter.value).toBe(null);
  expect(adapter.writes).toEqual([]);
});

test('rehydrate: status subscriber fails -> other observers run and successful hydration is retained', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  const failure = new Error('status listener failed');
  const observed: string[] = [];
  store.persist.subscribe(() => { throw failure; });
  store.persist.subscribe(status => observed.push(status.hydration));

  await store.persist.rehydrate();

  expect(observed).toEqual(['hydrating', 'hydrated']);
  expect(store.persist.getStatus()).toMatchObject({
    hydration: 'hydrated', error: { code: 'NOTIFICATION', cause: failure },
  });
});

for (const stage of ['migration', 'decode'] as const) {
  test(`rehydrate: ${stage} throws -> preserves the original cause and retries`, async () => {
    const adapter = new AsyncMemoryStorage();
    adapter.value = { state: { count: 4 }, version: 0 };
    const failure = new Error(`${stage} failed`);
    let failing = true;
    const store = pipe.use(persist({
      key: 'counter', storage: () => adapter,
      decode: (value) => {
        if (stage === 'decode' && failing) throw failure;
        return decodeCounter(value);
      },
      migrate: [(value: unknown) => {
        if (stage === 'migration' && failing) throw failure;
        return value;
      }],
    })).create({ count: 0 });

    await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'INVALID_DATA', cause: failure });
    expect(adapter.writes).toHaveLength(0);
    failing = false;
    await store.persist.rehydrate();
    await store.persist.flush();

    expect(store.getState()).toEqual({ count: 4 });
    expect(adapter.value).toEqual({ state: { count: 4 }, version: 1 });
  });
}
