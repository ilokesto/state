import { expect, test } from 'bun:test';
import { dispose, persist, validate } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from './helpers/persistStorage';

test('writes: rapid commits during active write -> one active write and latest waiting value', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  const values: unknown[] = [];
  adapter.setItem = async (_key, value) => {
    values.push(value.state);
    if (values.length === 1) { started.resolve(); await release.promise; }
    adapter.value = value;
  };
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });
  await started.promise;

  store.set({ count: 2 });
  store.set({ count: 3 });
  const flushed = store.persist.flush();
  expect(values).toEqual([{ count: 1 }]);
  release.resolve();
  await flushed;

  expect(values).toEqual([{ count: 1 }, { count: 3 }]);
  expect(store.persist.getStatus()).toMatchObject({ pending: false, saving: 'idle' });
});

test('writes: structured values with identical JSON representation -> saves each real commit without serialization', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({
    key: 'maps', storage: () => adapter,
    decode: (value: unknown): Map<string, number> | null => value instanceof Map ? value : null,
  })).create<Map<string, number>>(new Map());
  await store.persist.rehydrate();
  const first = new Map([['count', 1]]);
  const second = new Map([['count', 2]]);

  store.set(first);
  await store.persist.flush();
  store.set(second);
  await store.persist.flush();

  expect(adapter.writes).toHaveLength(2);
  expect(adapter.writes[0]?.state).toBe(first);
  expect(adapter.writes[1]?.state).toBe(second);
});

test('flush: future writes remain blocked -> resolves at the captured call-time target', async () => {
  const adapter = new AsyncMemoryStorage();
  const firstStarted = deferred<void>();
  const secondStarted = deferred<void>();
  const firstRelease = deferred<void>();
  const secondRelease = deferred<void>();
  let writes = 0;
  adapter.setItem = async (_key, value) => {
    if (++writes === 1) { firstStarted.resolve(); await firstRelease.promise; }
    else { secondStarted.resolve(); await secondRelease.promise; }
    adapter.value = value;
  };
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });
  await firstStarted.promise;

  const firstFlush = store.persist.flush();
  store.set({ count: 2 });
  firstRelease.resolve();
  await firstFlush;
  await secondStarted.promise;

  expect(adapter.value).toEqual({ state: { count: 1 }, version: 0 });
  expect(store.persist.getStatus().pending).toBe(true);
  const secondFlush = store.persist.flush();
  secondRelease.resolve();
  await secondFlush;
  expect(adapter.value).toEqual({ state: { count: 2 }, version: 0 });
});

for (const retry of ['flush', 'commit'] as const) {
  test(`writes: failed save retried by ${retry} -> preserves latest unsaved value without infinite retries`, async () => {
    const adapter = new AsyncMemoryStorage();
    const failure = new Error('write failed');
    let writes = 0;
    adapter.setItem = async (_key, value) => {
      if (++writes === 1) throw failure;
      adapter.value = value;
    };
    const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
    await store.persist.rehydrate();
    store.set({ count: 1 });

    await expect(store.persist.flush()).rejects.toMatchObject({ code: 'STORAGE', cause: failure });
    expect(writes).toBe(1);
    expect(store.persist.getStatus()).toMatchObject({ pending: true, saving: 'error' });
    if (retry === 'commit') store.set({ count: 2 });
    await store.persist.flush();

    expect(writes).toBe(2);
    expect(adapter.value).toEqual({ state: { count: retry === 'commit' ? 2 : 1 }, version: 0 });
    expect(store.persist.getStatus().pending).toBe(false);
  });
}

test('writes: notification error after reentrant commits -> latest committed state still saves', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
  await store.persist.rehydrate();
  store.subscribe(() => {
    if (store.getState().count === 1) store.set({ count: 2 });
    throw new Error('subscriber failed');
  });

  expect(() => store.set({ count: 1 })).toThrow(AggregateError);
  await store.persist.flush();

  expect(adapter.value).toEqual({ state: { count: 2 }, version: 0 });
});

test('writes: rejected validation and unchanged state -> no persistence target', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter }))
    .use(validate({
      '~standard': { vendor: 'test', version: 1, validate: (value: unknown) => {
        const decoded = decodeCounter(value);
        return decoded && decoded.count >= 0 ? { value: value as { count: number } } : { issues: [{ message: 'negative' }] };
      } },
    }, { onError: () => undefined })).create({ count: 0 });
  await store.persist.rehydrate();

  store.set(store.getState());
  store.set({ count: -1 });
  await store.persist.flush();

  expect(adapter.writes).toEqual([]);
});

test('clearStorage: active and waiting saves -> orders deletion last and rejects superseded flush', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  const operations: string[] = [];
  adapter.setItem = async (_key, value) => {
    operations.push('write');
    started.resolve();
    await release.promise;
    adapter.value = value;
  };
  adapter.removeItem = async () => { operations.push('remove'); adapter.value = null; };
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });
  await started.promise;
  store.set({ count: 2 });
  const flushed = store.persist.flush().catch((error: unknown) => error);

  const cleared = store.persist.clearStorage();
  release.resolve();
  expect(await flushed).toMatchObject({ code: 'CLEARED' });
  await cleared;

  expect(operations).toEqual(['write', 'remove']);
  expect(adapter.value).toBe(null);
  expect(store.getState()).toEqual({ count: 2 });
  await store.persist.flush();
  expect(operations).toEqual(['write', 'remove']);
});

test('clearStorage: new commit after deletion request -> writes only after delete finishes', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  const operations: string[] = [];
  adapter.removeItem = async () => {
    operations.push('remove:start'); started.resolve(); await release.promise;
    adapter.value = null; operations.push('remove:end');
  };
  adapter.setItem = async (_key, value) => { operations.push('write'); adapter.value = value; };
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
  await store.persist.rehydrate();

  const clearing = store.persist.clearStorage();
  await started.promise;
  store.set({ count: 3 });
  const flushing = store.persist.flush();
  release.resolve();
  await Promise.all([clearing, flushing]);

  expect(operations).toEqual(['remove:start', 'remove:end', 'write']);
  expect(adapter.value).toEqual({ state: { count: 3 }, version: 0 });
});

test('dispose: active write and pending target -> rejects flush and ignores late completion', async () => {
  const adapter = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  let writes = 0;
  adapter.setItem = async () => { writes += 1; started.resolve(); await release.promise; };
  const store = pipe.use(persist({ key: 'counter', decode: decodeCounter, storage: () => adapter })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });
  await started.promise;
  store.set({ count: 2 });
  const flushing = store.persist.flush().catch((error: unknown) => error);

  dispose(store);
  expect(await flushing).toMatchObject({ code: 'DISPOSED' });
  const status = store.persist.getStatus();
  release.resolve();
  await release.promise;
  store.set({ count: 3 });

  expect(writes).toBe(1);
  expect(store.persist.getStatus()).toBe(status);
  expect(adapter.disposals).toBe(1);
});
