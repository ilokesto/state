import { expect, test } from 'bun:test';
import { dispose, history, persist } from '../src/middleware/index.js';
import { pipe } from '../src/utils/index.js';

test('persist: equal stored state chosen after edits -> restoration still resets history', async () => {
  const store = pipe
    .use(history())
    .use(persist({
      key: 'counter',
      storage: () => ({
        async getItem() { return { state: 1, version: 0 }; },
        async setItem() {},
        async removeItem() {},
      }),
      decode: value => typeof value === 'number' ? value : null,
    }))
    .create<number>(0);
  store.set(1);
  expect(store.canUndo()).toBe(true);

  await store.persist.rehydrate({ conflict: 'use-stored' });

  expect(store.getState()).toBe(1);
  expect(store.canUndo()).toBe(false);
  store.undo();
  expect(store.getState()).toBe(1);
  dispose(store);
});
