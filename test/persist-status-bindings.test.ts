import { expect, test } from 'bun:test';
import { createPersistStatusStore } from '../src/core/shared/createPersistStatusStore';
import { dispose, persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter } from './helpers/persistStorage';

test('status bridge: independent subscriptions -> reconnects at current status without owning persistence', async () => {
  const storage = new AsyncMemoryStorage();
  const store = pipe.use(persist({ key: 'counter', storage: () => storage, decode: decodeCounter }))
    .create({ count: 0 });
  const status = createPersistStatusStore(store.persist);
  const initial = status.getInitialState();
  let notifications = 0;
  const stop = status.subscribe(() => { notifications++; });
  const pending: boolean[] = [];
  const stopSelection = status.subscribeSelector(state => state.pending, next => pending.push(next));

  await store.persist.rehydrate();
  store.persist.pause();
  store.set({ count: 1 });
  stop();
  const stoppedNotifications = notifications;
  await store.persist.flush();
  stopSelection();
  store.set({ count: 2 });
  const reconnected: boolean[] = [];
  const stopReconnected = status.subscribeSelector(state => state.pending, next => reconnected.push(next));
  await store.persist.flush();
  stopReconnected();

  expect(notifications).toBe(stoppedNotifications);
  expect(pending).toEqual([true, false]);
  expect(reconnected).toEqual([false]);
  expect(status.getInitialState()).toBe(initial);
  expect(status.getState()).toBe(store.persist.getStatus());
  expect(status.getState().disposed).toBe(false);
  dispose(store);
});
