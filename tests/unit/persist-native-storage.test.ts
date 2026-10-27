import { expect, test } from 'bun:test';
import { asyncStorage, dispose, mmkvStorage, persist } from '../../src/middleware';
import type { AsyncStorageLike, MMKVStorageLike, PersistCodec, PersistStorageFactory } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { decodeCounter, deferred } from '../fixtures/helpers/persistStorage';

for (const kind of ['async', 'mmkv'] as const) {
  test(`native storage: ${kind} structural injection -> lazy per-store round trip with unchanged keys and JSON bytes`, async () => {
    const values = new Map<string, string>();
    let activations = 0;
    const nativeAsync = {
      async getItem(key) { return values.get(key) ?? null; },
      async setItem(key, value) { values.set(key, value); },
      async removeItem(key) { values.delete(key); },
    } satisfies AsyncStorageLike;
    const nativeMMKV = {
      getString(key) { return values.get(key); },
      set(key, value) { values.set(key, value); },
      remove(key) { return values.delete(key); },
    } satisfies MMKVStorageLike;
    const storage: PersistStorageFactory = kind === 'async'
      ? asyncStorage(() => { activations += 1; return nativeAsync; })
      : mmkvStorage(() => { activations += 1; return nativeMMKV; });
    const create = () => pipe.use(persist({
      key: 'account:unchanged', storage, decode: decodeCounter,
    })).create({ count: 0 });
    const first = create();
    expect(activations).toBe(0);
    values.set('unrelated', 'keep');

    await first.persist.rehydrate();
    first.set({ count: 3 });
    await first.persist.flush();
    expect(values.get('account:unchanged')).toBe('{"state":{"count":3},"version":0}');
    dispose(first);
    const second = create();
    await second.persist.rehydrate();

    expect(second.getState()).toEqual({ count: 3 });
    expect(activations).toBe(2);
    await second.persist.clearStorage();
    expect(values.has('account:unchanged')).toBe(false);
    expect(values.get('unrelated')).toBe('keep');
    dispose(second);
  });

  test(`native storage: ${kind} custom codec -> retains unknown validation and original operation failures`, async () => {
    let text: string | null = null;
    let failure: Error | undefined;
    const codec: PersistCodec = {
      serialize: value => `${value.version}:${String(value.state)}`,
      deserialize: value => ({ version: Number(value.split(':')[0]), state: Number(value.split(':')[1]) }),
    };
    const storage = kind === 'async' ? asyncStorage(() => ({
      async getItem() { if (failure) throw failure; return text; },
      async setItem(_key, value) { if (failure) throw failure; text = value; },
      async removeItem() { if (failure) throw failure; text = null; },
    }), codec) : mmkvStorage(() => ({
      getString() { if (failure) throw failure; return text ?? undefined; },
      set(_key, value) { if (failure) throw failure; text = value; },
      remove() { if (failure) throw failure; text = null; },
    }), codec);
    const adapter = storage();
    await adapter.setItem('key', { state: 4, version: 0 });
    expect<string | null>(text).toBe('0:4');
    expect(await adapter.getItem('key')).toEqual({ state: 4, version: 0 });
    failure = new Error('native failure');

    await expect(adapter.getItem('key')).rejects.toBe(failure);
    await expect(adapter.setItem('key', { state: 2, version: 0 })).rejects.toBe(failure);
    await expect(adapter.removeItem('key')).rejects.toBe(failure);
  });
}

test('AsyncStorage: pending native write -> flush waits for completion rather than request dispatch', async () => {
  const started = deferred<void>();
  const completed = deferred<void>();
  let text: string | null = null;
  const store = pipe.use(persist({
    key: 'counter', decode: decodeCounter,
    storage: asyncStorage(() => ({
      async getItem() { return text; },
      async setItem(_key, value) { started.resolve(); await completed.promise; text = value; },
      async removeItem() { text = null; },
    })),
  })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 4 });
  await started.promise;
  const flush = store.persist.flush();
  expect(store.persist.getStatus().pending).toBe(true);
  expect(text).toBeNull();

  completed.resolve();
  await flush;

  expect<string | null>(text).toBe('{"state":{"count":4},"version":0}');
  expect(store.persist.getStatus().pending).toBe(false);
  dispose(store);
});

for (const text of ['null', '{', '{"state":{"count":"bad"},"version":0}']) {
  test(`AsyncStorage: malformed stored ${text} -> rejects without replacing current state`, async () => {
    const store = pipe.use(persist({
      key: 'counter', decode: decodeCounter,
      storage: asyncStorage(() => ({
        async getItem() { return text; }, async setItem() {}, async removeItem() {},
      })),
    })).create({ count: 1 });

    await expect(store.persist.rehydrate()).rejects.toBeInstanceOf(Error);

    expect(store.getState().count).toBe(1);
    dispose(store);
  });
}
