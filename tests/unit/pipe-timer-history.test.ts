import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { Store } from '@ilokesto/store';
import { debounce, devtools, dispose, history, persist, throttle, validate } from '../../src/middleware';
import type { DebounceControls, HistoryControls, HistoryStore, ThrottleControls } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter } from '../fixtures/helpers/persistStorage';
import { withBrowserFakes } from '../fixtures/helpers/browserFakes';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

for (const kind of ['debounce', 'throttle'] as const) {
  for (const historyFirst of [true, false]) {
    const timer = () => kind === 'debounce' ? debounce(10)
      : throttle(10, { leading: false, trailing: true });
    const make = () => {
      const store = new Store(0);
      if (historyFirst) history()(store);
      const timed = timer()(store);
      if (!historyFirst) history()(store);
      return timed as typeof timed & HistoryControls;
    };
    const controls = (store: ReturnType<typeof make>) =>
      'debounce' in store ? store.debounce : store.throttle;

    test(`${kind}/history ${historyFirst}: delayed writes -> records actual commit and replays synchronously`, () => {
      const store = make();
      const observed: number[] = [];
      store.subscribe(() => observed.push(store.getState()));

      store.set(1);
      store.update((value) => value + 2);
      expect(store.canUndo()).toBeFalse();
      jest.advanceTimersByTime(10);
      expect(store.getHistoryStatus().undoDepth).toBe(1);
      store.undo();
      expect(store.getState()).toBe(0);
      store.redo();
      expect(store.getState()).toBe(3);

      expect(observed).toEqual([3, 0, 3]);
      expect(controls(store).pending()).toBeFalse();
      expect(jest.getTimerCount()).toBe(0);
      dispose(store);
    });

    test(`${kind}/history ${historyFirst}: undo with pending intent -> cancels rather than commits that intent`, () => {
      const store = make();
      const control = controls(store);
      let pendingCalls = 0;
      store.set(1);
      control.flush();
      store.update(() => { pendingCalls += 1; return 2; });

      store.undo();
      jest.advanceTimersByTime(10);

      expect(store.getState()).toBe(0);
      expect(pendingCalls).toBe(0);
      expect(control.pending()).toBeFalse();
      expect(store.canUndo()).toBeFalse();
      expect(store.canRedo()).toBeTrue();
      store.set(9);
      store.redo();
      jest.advanceTimersByTime(10);
      expect(store.getState()).toBe(1);
      dispose(store);
    });

    test(`${kind}/history ${historyFirst}: undo without committed entries -> still cancels pending work`, () => {
      const store = make();
      store.set(1);

      store.undo();
      jest.advanceTimersByTime(10);

      expect(store.getState()).toBe(0);
      expect(controls(store).pending()).toBeFalse();
      expect(store.canRedo()).toBeFalse();
      dispose(store);
    });

    test(`${kind}/history ${historyFirst}: replay subscriber dispatches user update -> preserves ordinary timing and a new branch`, () => {
      const store = make();
      const control = controls(store);
      store.set(1);
      control.flush();
      const stop = store.subscribe(() => {
        if (store.getState() === 0) store.set(8);
      });

      store.undo();

      expect(store.getState()).toBe(0);
      expect(control.pending()).toBeTrue();
      expect(store.canRedo()).toBeTrue();
      jest.advanceTimersByTime(10);
      expect(store.getState()).toBe(8);
      expect(store.canRedo()).toBeFalse();
      stop();
      store.undo();
      expect(store.getState()).toBe(0);
      dispose(store);
    });
  }
}

for (const validationFirst of [true, false]) {
  test(`history/timer: validation ${validationFirst ? 'before' : 'after'} timer rejects replay -> retains entry for retry`, () => {
    let rejectZero = false;
    const validation = validate({
      '~standard': {
        version: 1, vendor: 'test',
        validate: (value: unknown) => typeof value === 'number' && !(rejectZero && value === 0)
          ? { value } : { issues: [{ message: 'rejected' }] },
      },
    }, { onError: () => undefined });
    const base = new Store(0);
    if (validationFirst) validation(base);
    else history()(base);
    const timed = debounce(10)(base);
    if (validationFirst) history()(base);
    else validation(base);
    const store = timed as typeof timed & HistoryControls;
    store.set(1);
    store.debounce.flush();
    store.set(2);
    rejectZero = true;

    store.undo();
    jest.advanceTimersByTime(10);

    expect(store.getState()).toBe(1);
    expect(store.canUndo()).toBeTrue();
    expect(store.canRedo()).toBeFalse();
    expect(store.debounce.pending()).toBeFalse();
    rejectZero = false;
    store.undo();
    expect(store.getState()).toBe(0);
    store.redo();
    expect(store.getState()).toBe(1);
    dispose(store);
  });
}

test('history/timer: validation transforms replay -> reverse entry reflects actual committed transition', () => {
  let transform = false;
  const timed = debounce(10)(new Store(0));
  validate({
    '~standard': {
      version: 1, vendor: 'test',
      validate: (value: unknown) => typeof value === 'number'
        ? { value: transform && value === 0 ? 5 : value }
        : { issues: [{ message: 'number required' }] },
    },
  })(timed);
  const store = history()(timed) as HistoryStore<number> & DebounceControls;
  store.set(1);
  store.debounce.flush();
  transform = true;

  store.undo();

  expect(store.getState()).toBe(5);
  store.redo();
  expect(store.getState()).toBe(1);
  store.undo();
  expect(store.getState()).toBe(5);
  dispose(store);
});

test('history/timers: two queued timer stages -> replay cancels both and commits through both synchronously', () => {
  const timed = debounce(10)(new Store(0));
  throttle(20, { leading: false, trailing: true })(timed);
  const store = history()(timed) as HistoryStore<number> & DebounceControls & ThrottleControls;
  store.set(1);
  store.debounce.flush();
  expect(store.throttle.pending()).toBeTrue();
  store.throttle.flush();
  store.set(2);
  store.debounce.flush();
  store.set(3);

  store.undo();
  jest.advanceTimersByTime(20);

  expect(store.getState()).toBe(0);
  expect(store.debounce.pending()).toBeFalse();
  expect(store.throttle.pending()).toBeFalse();
  store.redo();
  expect(store.getState()).toBe(1);
  dispose(store);
});

test('history/timer: pause and group scopes -> use scope at commit time rather than enqueue time', () => {
  const store = debounce(10)(history()(new Store(0))) as HistoryStore<number> & DebounceControls;
  store.group(() => { store.set(1); });
  store.pauseHistory();

  store.debounce.flush();

  expect(store.canUndo()).toBeFalse();
  store.set(2);
  store.resumeHistory();
  store.group(() => {
    store.debounce.flush();
    store.set(3);
    store.debounce.flush();
  });
  expect(store.getHistoryStatus().undoDepth).toBe(1);
  store.undo();
  expect(store.getState()).toBe(1);
  dispose(store);
});

test('history/timer: replay requested by commit subscriber -> queued replay retains synchronous identity', () => {
  const store = history()(debounce(10)(new Store(0))) as HistoryStore<number> & DebounceControls;
  store.subscribe(() => { if (store.getState() === 1) store.undo(); });

  store.set(1);
  store.debounce.flush();

  expect(store.getState()).toBe(0);
  expect(store.canUndo()).toBeFalse();
  expect(store.canRedo()).toBeTrue();
  dispose(store);
});

test('history/timer: cancel occurs inside flushing updater -> old batch cannot overwrite the replay', () => {
  const store = debounce(10)(history()(new Store(0))) as HistoryStore<number> & DebounceControls;
  store.set(1);
  store.debounce.flush();
  store.update(() => { store.undo(); return 99; });

  store.debounce.flush();

  expect(store.getState()).toBe(0);
  expect(store.canRedo()).toBeTrue();
  dispose(store);
});

test('history/timer: replay subscriber disposes and reuses store -> new dispatch still obeys timing', () => {
  const store = pipe.use(history()).use(debounce(10)).create({ count: 0 });
  store.set({ count: 1 });
  store.debounce.flush();
  const stop = store.subscribe(() => {
    if (store.getState().count === 0) {
      dispose(store);
      store.set({ count: 8 });
    }
  });

  store.undo();

  expect(store.getState()).toEqual({ count: 0 });
  expect(store.debounce.pending()).toBeTrue();
  expect(store.getHistoryStatus().disposed).toBeTrue();
  jest.advanceTimersByTime(10);
  expect(store.getState()).toEqual({ count: 8 });
  stop();
  dispose(store);
});

test('history/timer/persist: persistence flush -> waits only for committed saves, not timer intent', async () => {
  const adapter = new AsyncMemoryStorage();
  const store = pipe.use(debounce(10)).use(history()).use(persist({
    key: 'timers', storage: () => adapter, decode: decodeCounter,
  })).create({ count: 0 });
  await store.persist.rehydrate();
  store.set({ count: 1 });

  await store.persist.flush();

  expect(store.getState()).toEqual({ count: 0 });
  expect(adapter.writes).toEqual([]);
  store.debounce.flush();
  await store.persist.flush();
  expect(adapter.value).toEqual({ state: { count: 1 }, version: 0 });
  store.set({ count: 2 });
  store.undo();
  await store.persist.flush();
  jest.advanceTimersByTime(10);
  expect(adapter.value).toEqual({ state: { count: 0 }, version: 0 });
  expect(store.getState()).toEqual({ count: 0 });
  dispose(store);
});

test('history/timer: DevTools after timing -> replay retains history action metadata', () => {
  withBrowserFakes<{ count: number }>((_storage, connections) => {
    const store = pipe.use(debounce(10)).use(history()).use(devtools('timer')).create({ count: 0 });
    store.set({ count: 1 });
    store.debounce.flush();
    connections[0].sends.length = 0;

    store.undo();
    store.redo();

    expect(connections[0].sends).toEqual([
      { action: 'timer:history/undo', state: { count: 0 } },
      { action: 'timer:history/redo', state: { count: 1 } },
    ]);
    dispose(store);
  });
});
