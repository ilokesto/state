import { expect, test } from 'bun:test';
import { createPersistStatusStore } from '../../src/core/shared/createPersistStatusStore';
import { dispose, persist } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter } from '../fixtures/helpers/persistStorage';

test('status bridge: hydration listener commits reentrantly -> full and selected views retain current pending state', async () => {
  const storage = new AsyncMemoryStorage();
  const store = pipe.use(persist({ key: 'counter', storage: () => storage, decode: decodeCounter }))
    .create({ count: 0 });
  store.persist.pause();
  let edited = false;
  const stopWriter = store.persist.subscribe(snapshot => {
    if (snapshot.hydration === 'hydrated' && !edited) {
      edited = true;
      store.set({ count: 1 });
    }
  });
  const status = createPersistStatusStore(store.persist);
  let full = status.getState();
  let pending = full.pending;
  const stopFull = status.subscribeSelector(value => value, value => { full = value; });
  const stopPending = status.subscribeSelector(value => value.pending, value => { pending = value; });

  await store.persist.rehydrate();

  expect(store.getState()).toEqual({ count: 1 });
  expect(store.persist.getStatus().pending).toBe(true);
  expect(full).toBe(store.persist.getStatus());
  expect(pending).toBe(true);
  stopFull();
  stopPending();
  stopWriter();
  dispose(store);
});

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
