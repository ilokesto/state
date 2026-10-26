import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';
import { dispose, history, persist } from '../src/middleware';
import { pipe } from '../src/utils/pipe';
import { AsyncMemoryStorage, decodeCounter } from './helpers/persistStorage';

test('undo: middleware edits an untracked field before forwarding -> preserves the latest untracked value', () => {
  const store = pipe.use(history({
    select: (state: Readonly<{ count: number; label: string }>) => state.count,
    restore: (current, count) => ({ ...current, count }),
  })).create({ count: 0, label: 'initial' });
  store.set({ count: 1, label: 'before' });
  let intervene = true;
  store.pushMiddleware((action, next) => {
    if (intervene) {
      intervene = false;
      store.set({ count: 1, label: 'user edit' });
    }
    next(action);
  });

  store.undo();

  expect(store.getState()).toEqual({ count: 0, label: 'user edit' });
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: 1 });
  dispose(store);
});

test('history metadata: listener disposes during notification -> all active observers receive terminal status', () => {
  const store = history()(new Store<number>(0));
  const seen: { listener: string; disposed: boolean }[] = [];
  store.subscribeHistory(status => {
    seen.push({ listener: 'first', disposed: status.disposed });
    if (!status.disposed && status.undoDepth === 1) {
      dispose(store);
    }
  });
  store.subscribeHistory(status => {
    seen.push({ listener: 'second', disposed: status.disposed });
  });

  store.set(1);

  expect(seen.filter(entry => entry.disposed)).toEqual([
    { listener: 'first', disposed: true },
    { listener: 'second', disposed: true },
  ]);
  expect(store.getHistoryStatus()).toMatchObject({ disposed: true, undoDepth: 0 });
});

test('history: subscriber commits recursively -> records captured transitions in chronological order', () => {
  const store = history()(new Store<number>(0));
  const stop = store.subscribe(() => { if (store.getState() === 1) store.set(2); });

  store.set(1);
  stop();
  store.undo();

  expect(store.getState()).toBe(1);
  store.undo();
  expect(store.getState()).toBe(0);
  store.redo();
  expect(store.getState()).toBe(1);
  store.redo();
  expect(store.getState()).toBe(2);
});

test('undo: subscriber writes during replay -> records the user branch rather than suppressing it', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  store.set(2);
  const stop = store.subscribe(() => { if (store.getState() === 1) store.set(10); });

  store.undo();
  stop();

  expect(store.getState()).toBe(10);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 2, redoDepth: 0 });
  store.undo();
  expect(store.getState()).toBe(1);
  store.undo();
  expect(store.getState()).toBe(0);
});

test('undo: reentrant middleware commits before replay -> records restoration as a new branch without discarding user commits', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  let reenter = true;
  store.pushMiddleware((action, next) => {
    if (reenter) {
      reenter = false;
      store.set(5);
    }
    next(action);
  });

  store.undo();

  expect(store.getState()).toBe(0);
  store.undo();
  expect(store.getState()).toBe(5);
  store.undo();
  expect(store.getState()).toBe(1);
  store.undo();
  expect(store.getState()).toBe(0);
});

test('undo: rejected replay -> keeps both stacks unchanged until the middleware accepts it', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  let reject = true;
  store.unshiftMiddleware((action, next) => { if (!reject) next(action); });
  const snapshot = store.getHistoryStatus();

  store.undo();

  expect(store.getState()).toBe(1);
  expect(store.getHistoryStatus()).toBe(snapshot);
  reject = false;
  store.undo();
  expect(store.getState()).toBe(0);
  store.redo();
  expect(store.getState()).toBe(1);
});

test('undo: middleware replaces state before evaluating replay -> keeps the intervention as ordinary history', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  let replace = true;
  store.pushMiddleware((action, next) => {
    if (replace) {
      replace = false;
      store.replaceState(5);
    }
    next(action);
  });

  store.undo();
  store.undo();

  expect(store.getState()).toBe(5);
  store.undo();
  expect(store.getState()).toBe(1);
  store.undo();
  expect(store.getState()).toBe(0);
});

test('undo: middleware replacement during queued replay -> retains pre-evaluation commits in order', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  let replace = false;
  store.pushMiddleware((action, next) => {
    if (replace) {
      replace = false;
      store.replaceState(5);
    }
    next(action);
  });
  const stop = store.subscribe(() => {
    if (store.getState() !== 2) return;
    replace = true;
    store.undo();
  });

  store.set(2);
  stop();
  store.undo();

  expect(store.getState()).toBe(5);
  store.undo();
  expect(store.getState()).toBe(2);
  store.undo();
  expect(store.getState()).toBe(1);
});

test('undo: middleware changes only untracked fields -> keeps the selected entry available for retry', () => {
  const store = pipe.use(history({
    select: (state: Readonly<{ count: number; label: string }>) => state.count,
    restore: (current, count) => ({ ...current, count }),
  })).create({ count: 0, label: 'initial' });
  store.set({ count: 1, label: 'edited' });
  let rejectSelection = true;
  store.pushMiddleware((action, next) => {
    if (rejectSelection) next(() => ({ ...store.getState(), label: 'still edited' }));
    else next(action);
  });

  store.undo();

  expect(store.getState()).toEqual({ count: 1, label: 'still edited' });
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  rejectSelection = false;
  store.undo();
  expect(store.getState()).toEqual({ count: 0, label: 'still edited' });
});

test('undo: replay notification throws after commit -> moves stacks once and preserves the exception', () => {
  const store = history()(new Store<number>(0));
  store.set(1);
  const stop = store.subscribe(() => { throw new Error('body observer failed'); });

  expect(() => store.undo()).toThrow(AggregateError);
  stop();

  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: 1 });
  store.redo();
  expect(store.getState()).toBe(1);
});

test('undo: middleware transforms a replay -> redo restores the actual state before undo', () => {
  const store = history()(new Store<number>(0));
  store.set(10);
  let transform = true;
  store.pushMiddleware((action, next) => {
    const candidate = typeof action === 'function' ? action(store.getState()) : action;
    next(() => transform ? candidate + 1 : candidate);
  });

  store.undo();
  transform = false;
  store.redo();

  expect(store.getState()).toBe(10);
  store.undo();
  expect(store.getState()).toBe(1);
});

test('group: writes queued by a subscriber -> remains one entry after the callback closes', () => {
  const store = history()(new Store<number>(0));
  const stop = store.subscribe(() => {
    if (store.getState() === 1) store.group(() => { store.set(2); store.set(3); });
  });

  store.set(1);
  stop();
  store.undo();

  expect(store.getState()).toBe(1);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 1, isGrouping: false });
  store.undo();
  expect(store.getState()).toBe(0);
});

test('undo: multiple requests after queued subscriber writes -> replays after those commits in request order', () => {
  const store = history()(new Store<number>(0));
  let run = true;
  const stop = store.subscribe(() => {
    if (!run) return;
    run = false;
    store.set(2);
    store.set(3);
    store.undo();
    store.undo();
  });

  store.set(1);
  stop();

  expect(store.getState()).toBe(1);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 2 });
  store.redo();
  expect(store.getState()).toBe(2);
  store.redo();
  expect(store.getState()).toBe(3);
});

test('history metadata: reentrant writes during recording -> preserves captured states and branch depth', () => {
  const store = history()(new Store<number>(0));
  const depths: number[] = [];
  let reenter = true;
  store.subscribeHistory(status => {
    depths.push(status.undoDepth);
    if (reenter && status.undoDepth === 1) {
      reenter = false;
      store.set(2);
    }
  });

  store.set(1);
  store.undo();

  expect(store.getState()).toBe(1);
  expect(depths).toEqual([1, 2, 1]);
});

test('clearHistory: pending subscriber commits -> discards prior commits and records only later writes', () => {
  const store = history()(new Store<number>(0));
  const stop = store.subscribe(() => {
    if (store.getState() !== 1) return;
    store.set(2);
    store.clearHistory();
    store.set(3);
  });

  store.set(1);
  stop();
  store.undo();

  expect(store.getState()).toBe(2);
  expect(store.canUndo()).toBe(false);
});

test('pauseHistory: queued subscriber writes -> captures recording mode at each dispatch', () => {
  const store = history()(new Store<number>(0));
  const stop = store.subscribe(() => {
    if (store.getState() !== 1) return;
    store.pauseHistory();
    store.set(2);
    store.resumeHistory();
    store.set(3);
  });

  store.set(1);
  stop();
  store.undo();

  expect(store.getState()).toBe(2);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, isPaused: false });
});

test('persist: restoration and reentrant metadata edits -> resets pre-restore entries and records post-restore user commits', async () => {
  const adapter = new AsyncMemoryStorage();
  adapter.value = { state: { count: 4 }, version: 0 };
  const store = pipe.use(history()).use(persist({
    key: 'history-baseline', decode: decodeCounter, storage: () => adapter,
  })).create({ count: 0 });
  store.set({ count: 1 });
  let editBeforeRestore = true;
  const stopMetadata = store.subscribeHistory(status => {
    if (editBeforeRestore && status.undoDepth === 0) {
      editBeforeRestore = false;
      store.set({ count: 2 });
    }
  });
  const stopBody = store.subscribe(() => {
    if (store.getState().count === 4) store.set({ count: 5 });
  });

  await store.persist.rehydrate({ conflict: 'use-stored' });
  stopMetadata();
  stopBody();
  store.undo();

  expect(store.getState()).toEqual({ count: 4 });
  expect(store.canUndo()).toBe(false);
});
