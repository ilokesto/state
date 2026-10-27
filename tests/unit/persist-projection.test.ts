import { expect, test } from 'bun:test';
import { persist, validate } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter, deferred } from '../fixtures/helpers/persistStorage';

type Editor = { count: number; transient: string };
const project = (state: Editor) => ({ count: state.count });
const restore = (saved: { count: number }, current: Editor): Editor => ({ ...current, ...saved });

test('projection: restored subset -> preserves explicit transient state and saves only the projection', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'editor', storage: () => adapter, project, decode: decodeCounter, restore,
  })).create({ count: 0, transient: 'session' });

  await store.persist.rehydrate();
  expect(store.getState()).toEqual({ count: 4, transient: 'session' });
  store.set({ count: 5, transient: 'private' });
  await store.persist.flush();

  expect(adapter.value).toEqual({ state: { count: 5 }, version: 0 });
});

test('projection: rejected decoder -> never invokes restore or changes state', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 'invalid' }, version: 0 };
  let restores = 0;
  const store = pipe.use(persist({
    key: 'editor', storage: () => adapter, project, decode: decodeCounter,
    restore: (saved, current) => { restores += 1; return restore(saved, current); },
  })).create({ count: 0, transient: 'session' });

  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'INVALID_DATA' });

  expect(restores).toBe(0);
  expect(store.getState()).toEqual({ count: 0, transient: 'session' });
  expect(adapter.writes).toEqual([]);
});

for (const conflict of ['keep-current', 'use-stored'] as const) {
  test(`projection: hydration conflict resolved with ${conflict} -> preserves the chosen full state`, async () => {
    const adapter = new AsyncMemoryStorage();
    const started = deferred<void>();
    const read = deferred<unknown>();
    adapter.getItem = () => { started.resolve(); return read.promise; };
    const store = pipe.use(persist({
      key: 'editor', storage: () => adapter, project, decode: decodeCounter, restore,
    })).create({ count: 0, transient: 'initial' });
    const hydration = store.persist.rehydrate();
    const rejected = hydration.catch((error: unknown) => error);
    await started.promise;
    store.set({ count: 2, transient: 'edited' });
    read.resolve({ state: { count: 8 }, version: 0 });
    expect(await rejected).toMatchObject({ code: 'CONFLICT' });

    await store.persist.rehydrate({ conflict });
    await store.persist.flush();

    expect(store.getState()).toEqual({ count: conflict === 'keep-current' ? 2 : 8, transient: 'edited' });
    expect(adapter.writes).toEqual(conflict === 'keep-current' ? [{ state: { count: 2 }, version: 0 }] : []);
  });
}

test('projection: restore fails state validation -> retains current state and skips migration rewrite', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'editor', storage: () => adapter, project, decode: decodeCounter,
    restore: (saved, current) => ({ ...current, count: -saved.count }),
    migrate: [(value: unknown) => value],
  })).use(validate({
    '~standard': {
      version: 1, vendor: 'test',
      validate: (value: unknown) => {
        const decoded = decodeCounter(value);
        if (
          decoded === null || decoded.count < 0 ||
          typeof value !== 'object' || value === null ||
          !('transient' in value) || typeof value.transient !== 'string'
        ) {
          return { issues: [{ message: 'invalid editor' }] };
        }
        return { value: { count: decoded.count, transient: value.transient } };
      },
    },
  })).create({ count: 0, transient: 'session' });

  await expect(store.persist.rehydrate()).rejects.toMatchObject({ code: 'VALIDATION' });

  expect(store.getState()).toEqual({ count: 0, transient: 'session' });
  expect(adapter.writes).toEqual([]);
});

test('projection: migration -> rewrites the projection rather than transient state', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(persist({
    key: 'editor', storage: () => adapter, project, decode: decodeCounter, restore,
    migrate: [(value: unknown) => value],
  })).create({ count: 0, transient: 'session' });

  await store.persist.rehydrate();
  await store.persist.flush();

  expect(adapter.value).toEqual({ state: { count: 4 }, version: 1 });
});

test('projection: save projection throws -> state commits synchronously and explicit retry saves', async () => {
  const adapter = new AsyncMemoryStorage();
  const failure = new Error('projection failed');
  let failing = true;
  const store = pipe.use(persist({
    key: 'editor', storage: () => adapter, decode: decodeCounter, restore,
    project: (state: Editor) => { if (failing) throw failure; return project(state); },
  })).create({ count: 0, transient: 'session' });
  await store.persist.rehydrate();

  store.set({ count: 2, transient: 'private' });
  expect(store.getState().count).toBe(2);
  await expect(store.persist.flush()).rejects.toMatchObject({ code: 'INVALID_DATA', cause: failure });
  failing = false;
  await store.persist.retry();

  expect(adapter.value).toEqual({ state: { count: 2 }, version: 0 });
});
