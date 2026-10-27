import { expect, test } from 'bun:test';
import { asyncStorage, dispose, persist, ttlStorage } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from '../fixtures/helpers/persistStorage';

test('ttlStorage: explicit wrapper -> preserves inner state and version until the exact expiration boundary', async () => {
  const underlying = new AsyncMemoryStorage();
  let now = 100;
  const adapter = ttlStorage(() => underlying, { ttlMs: 50, now: () => now })();
  const state = new Map([['count', 2]]);

  await adapter.setItem('key', { state, version: 3 });

  expect(underlying.value).toEqual({
    state: { __persistTTL: 1, expiresAt: 150, value: state }, version: 3,
  });
  now = 149;
  expect(await adapter.getItem('key')).toEqual({ state, version: 3 });
  now = 150;
  expect(await adapter.getItem('key')).toBeNull();
  expect(underlying.removes).toBe(0);
  await adapter.removeItem('key');
  expect(underlying.value).toBeNull();
  adapter.dispose?.();
  expect(underlying.disposals).toBe(1);
});

test('ttlStorage: read completes after expiration and a concurrent replacement -> ignores old value without deleting replacement', async () => {
  const underlying = new AsyncMemoryStorage();
  let now = 10;
  const adapter = ttlStorage(() => underlying, { ttlMs: 10, now: () => now })();
  await adapter.setItem('key', { state: { count: 1 }, version: 0 });
  const expired = underlying.value;
  const read = deferred<unknown>();
  underlying.getItem = () => read.promise;
  const pending = adapter.getItem('key');
  now = 20;
  await adapter.setItem('key', { state: { count: 9 }, version: 0 });

  read.resolve(expired);

  expect(await pending).toBeNull();
  expect(underlying.value).toEqual({
    state: { __persistTTL: 1, expiresAt: 30, value: { count: 9 } }, version: 0,
  });
  expect(underlying.removes).toBe(0);
});

test('ttlStorage: write completes after its deadline -> does not renew the original expiration', async () => {
  const underlying = new AsyncMemoryStorage();
  const started = deferred<void>();
  const release = deferred<void>();
  let now = 100;
  underlying.setItem = async (_key, value) => {
    started.resolve();
    await release.promise;
    underlying.value = value;
  };
  const adapter = ttlStorage(() => underlying, { ttlMs: 10, now: () => now })();
  const write = adapter.setItem('key', { state: 4, version: 0 });
  await started.promise;

  now = 111;
  release.resolve();
  await write;

  expect(await adapter.getItem('key')).toBeNull();
  expect(underlying.removes).toBe(0);
});

for (const invalid of [
  { state: 1, version: 0 },
  { state: { __persistTTL: 1, expiresAt: 50, value: 1 }, version: -1 },
  { state: { __persistTTL: 1, expiresAt: NaN, value: 1 }, version: 0 },
  { state: { __persistTTL: 1, expiresAt: 50 }, version: 0 },
  { state: { __persistTTL: 2, expiresAt: 50, value: 1 }, version: 0 },
]) {
  test('ttlStorage: legacy or malformed metadata -> rejects without implicitly rewriting or deleting', async () => {
    const underlying = new AsyncMemoryStorage();
    underlying.value = invalid;
    const adapter = ttlStorage(() => underlying, { ttlMs: 10, now: () => 100 })();

    await expect(adapter.getItem('key')).rejects.toBeInstanceOf(TypeError);

    expect(underlying.value).toBe(invalid);
    expect(underlying.removes).toBe(0);
    expect(underlying.writes).toEqual([]);
  });
}

test('ttlStorage: invalid duration or clock -> fails explicitly before committing metadata', async () => {
  const underlying = new AsyncMemoryStorage();
  for (const ttlMs of [0, -1, Infinity, NaN]) {
    expect(() => ttlStorage(() => underlying, { ttlMs })).toThrow(RangeError);
  }
  const adapter = ttlStorage(() => underlying, { ttlMs: 10, now: () => NaN })();

  await expect(adapter.setItem('key', { state: 1, version: 0 })).rejects.toBeInstanceOf(RangeError);

  expect(underlying.writes).toEqual([]);
});

test('logout: native write pending through TTL -> clear waits for write and new account cannot restore the previous account', async () => {
  const values = new Map<string, string>();
  const started = deferred<void>();
  const release = deferred<void>();
  const operations: string[] = [];
  const storage = ttlStorage(asyncStorage(() => ({
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) {
      operations.push(`write:${key}`);
      if (key === 'account:alice') { started.resolve(); await release.promise; }
      values.set(key, value);
    },
    async removeItem(key) { operations.push(`remove:${key}`); values.delete(key); },
  })), { ttlMs: 100, now: () => 0 });
  const create = (key: string) => pipe.use(persist({ key, storage, decode: decodeCounter })).create({ count: 0 });
  const alice = create('account:alice');
  await alice.persist.rehydrate();
  alice.set({ count: 3 });
  await started.promise;
  alice.set({ count: 5 });
  const flushed = alice.persist.flush().catch((error: unknown) => error);
  alice.persist.pause();
  const cleared = alice.persist.clearStorage();
  release.resolve();

  await cleared;
  dispose(alice);
  const bob = create('account:bob');
  await bob.persist.rehydrate();
  bob.set({ count: 8 });
  await bob.persist.flush();

  expect(await flushed).toMatchObject({ code: 'CLEARED' });
  expect(operations).toEqual(['write:account:alice', 'remove:account:alice', 'write:account:bob']);
  expect(values.has('account:alice')).toBe(false);
  expect(JSON.parse(values.get('account:bob') ?? '').state.value).toEqual({ count: 8 });
  dispose(bob);
});

test('logout: pending native read -> clear and dispose prevent resurrection in the next same-key store', async () => {
  const underlying = new AsyncMemoryStorage();
  const read = deferred<unknown>();
  const started = deferred<void>();
  underlying.getItem = () => { started.resolve(); return read.promise; };
  const storage = ttlStorage(() => underlying, { ttlMs: 100, now: () => 0 });
  const create = () => pipe.use(persist({ key: 'session', storage, decode: decodeCounter })).create({ count: 0 });
  const previous = create();
  const hydrated = previous.persist.rehydrate().catch((error: unknown) => error);
  await started.promise;

  previous.persist.pause();
  await previous.persist.clearStorage();
  dispose(previous);
  underlying.getItem = async () => underlying.value;
  const next = create();
  await next.persist.rehydrate();
  read.resolve({ state: { __persistTTL: 1, expiresAt: 100, value: { count: 9 } }, version: 0 });
  await read.promise;

  expect(await hydrated).toMatchObject({ code: 'CLEARED' });
  expect(previous.getState().count).toBe(0);
  expect(next.getState().count).toBe(0);
  expect(underlying.writes).toEqual([]);
  dispose(next);
});

test('ttlStorage: optional invalidation capability -> forwards events and reads expiry before synchronization', async () => {
  const underlying = new AsyncMemoryStorage();
  let listener: (() => void) | undefined;
  const observable = Object.assign(underlying, {
    subscribe(_key: string, callback: () => void) {
      listener = callback;
      return () => { listener = undefined; };
    },
  });
  let now = 0;
  const factory = ttlStorage(() => observable, { ttlMs: 10, now: () => now });
  const writer = factory();
  await writer.setItem('key', { state: { count: 3 }, version: 0 });
  const store = pipe.use(persist({ key: 'key', storage: factory, decode: decodeCounter, sync: {} })).create({ count: 0 });
  await store.persist.rehydrate();
  await writer.setItem('key', { state: { count: 8 }, version: 0 });
  now = 10;
  const synced = deferred<void>();
  store.persist.subscribe(status => { if (status.error === null) synced.resolve(); });

  listener?.();
  await synced.promise;

  expect(store.getState().count).toBe(3);
  expect(underlying.writes).toHaveLength(2);
  dispose(store);
  expect(listener).toBeUndefined();
});
