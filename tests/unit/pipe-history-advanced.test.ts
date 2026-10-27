import { expect, test } from 'bun:test';
import { Store } from '@ilokesto/store';
import { dispose, history, validate } from '../../src/middleware';
import type { HistoryStatus, HistoryStrategy } from '../../src/middleware';
import { pipe } from '../../src/utils/pipe';

test('group: nested callbacks and exceptions -> retains committed work as one reversible entry', () => {
  const store = history()(new Store<number>(0));
  const failure = new Error('group failed');

  expect(() => store.group(() => {
    store.set(1);
    expect(store.group(() => { store.set(2); return 'nested'; })).toBe('nested');
    store.set(3);
    throw failure;
  })).toThrow(failure);

  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, isGrouping: false });
  store.undo();
  expect(store.getState()).toBe(0);
  store.redo();
  expect(store.getState()).toBe(3);
});

test('group: empty rejected and no-op writes -> preserves the redo branch until a changed commit', () => {
  const store = history()(new Store<number>(0));
  store.pushMiddleware((action, next) => {
    const candidate = typeof action === 'function' ? action(store.getState()) : action;
    if (candidate >= 0) next(() => candidate);
  });
  store.set(1);
  store.undo();

  store.group(() => { store.set(0); store.set(-1); });

  expect(store.canUndo()).toBe(false);
  expect(store.canRedo()).toBe(true);
  store.group(() => { store.set(2); store.set(3); });
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  store.undo();
  expect(store.getState()).toBe(0);
});

for (const limit of [0, 1, 2]) {
  test(`group: limit ${limit} -> evicts whole groups rather than their constituent commits`, () => {
    const store = history({ limit })(new Store<number>(0));
    for (let value = 1; value <= 3; value += 1) {
      store.group(() => { store.set(value * 10); store.set(value * 10 + 1); });
    }

    for (let index = 0; index < 4; index += 1) store.undo();

    expect(store.getState()).toBe(limit === 0 ? 31 : limit === 1 ? 21 : 11);
    expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: limit });
    for (let index = 0; index < 4; index += 1) store.redo();
    expect(store.getState()).toBe(31);
  });
}

test('group: net-zero primitive transitions -> consumes undo and redo without a body notification', () => {
  const store = history()(new Store<number>(0));
  store.group(() => { store.set(1); store.set(0); });
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  store.undo();

  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: 1 });
  store.redo();
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  expect(notifications).toBe(0);
});

test('group: undo inside an open callback -> rejects replay while preserving the recorded group', () => {
  const store = history()(new Store<number>(0));

  expect(() => store.group(() => { store.set(1); store.undo(); })).toThrow(TypeError);

  expect(store.getState()).toBe(1);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, isGrouping: false });
  store.undo();
  expect(store.getState()).toBe(0);
});

test('group: runtime Promise return -> rejects async grouping but keeps synchronous committed work', () => {
  const store = history()(new Store<number>(0));

  expect(() => Reflect.apply(store.group, store, [() => {
    store.set(1);
    return Promise.resolve();
  }])).toThrow(TypeError);

  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, isGrouping: false });
  store.undo();
  expect(store.getState()).toBe(0);
});

type Editor = { text: string; cursor: number; ignored: boolean };
const selection = {
  select: (state: Readonly<Editor>) => state.text,
  restore: (current: Readonly<Editor>, text: string): Editor => ({ ...current, text }),
};

test('history: selected text and untracked cursor -> undo and redo preserve the latest untracked fields', () => {
  const store = pipe.use(history(selection)).create({ text: '', cursor: 0, ignored: false });
  store.group(() => {
    store.set({ text: 'a', cursor: 1, ignored: false });
    store.set({ text: 'ab', cursor: 2, ignored: false });
  });
  store.set({ text: 'ab', cursor: 10, ignored: true });

  store.undo();

  expect(store.getState()).toEqual({ text: '', cursor: 10, ignored: true });
  store.set({ text: '', cursor: 20, ignored: true });
  expect(store.canRedo()).toBe(true);
  store.redo();
  expect(store.getState()).toEqual({ text: 'ab', cursor: 20, ignored: true });
});

test('history: filter skips a transition -> next accepted entry starts at the actual skipped state', () => {
  const transitions: string[] = [];
  const store = pipe.use(history({
    ...selection,
    filter: (previous, next) => {
      transitions.push(`${previous.text}:${next.text}`);
      return !next.ignored;
    },
  })).create({ text: '', cursor: 0, ignored: false });

  store.set({ text: 'remote', cursor: 5, ignored: true });
  store.set({ text: 'local', cursor: 6, ignored: false });
  store.undo();

  expect(transitions).toEqual([':remote', 'remote:local']);
  expect(store.getState()).toEqual({ text: 'remote', cursor: 6, ignored: false });
  expect(store.canUndo()).toBe(false);
});

test('history: selected changes while paused or filtered -> invalidates redo without adding undo entries', () => {
  const store = history<number>({ filter: (_previous, next) => next !== 8 })(new Store<number>(0));
  store.set(1);
  store.undo();
  store.pauseHistory();

  store.set(5);
  store.resumeHistory();
  store.set(6);
  store.undo();

  expect(store.getState()).toBe(5);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: 1, isPaused: false });
  store.set(8);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
});

test('history: custom selection equality -> skips equal selections while preserving their redo branch', () => {
  const store = pipe.use(history({
    select: (state: Readonly<Editor>) => ({ text: state.text }),
    restore: (current, selected) => ({ ...current, text: selected.text }),
    isEqual: (previous, next) => previous.text === next.text,
  })).create({ text: '', cursor: 0, ignored: false });
  store.set({ text: 'a', cursor: 1, ignored: false });
  store.undo();
  const snapshot = store.getHistoryStatus();

  store.set({ text: '', cursor: 8, ignored: false });

  expect(store.getHistoryStatus()).toBe(snapshot);
  store.redo();
  expect(store.getState()).toEqual({ text: 'a', cursor: 8, ignored: false });
});

test('history: filter follows validation -> receives only accepted committed values', () => {
  const transitions: number[][] = [];
  const store = history<number>({
    filter: (previous, next) => { transitions.push([previous, next]); return true; },
  })(new Store<number>(0));
  validate({
    '~standard': {
      version: 1, vendor: 'history-test',
      validate: (value: unknown) => typeof value === 'number' && value >= 0
        ? { value: Math.floor(value) } : { issues: [{ message: 'rejected' }] },
    },
  }, { onError: () => undefined })(store);

  store.set(2.5);
  store.set(-1);
  store.undo();

  expect(transitions).toEqual([[0, 2]]);
  expect(store.getState()).toBe(0);
});

const deltaStrategy: HistoryStrategy<number, { delta: number }> = {
  diff: (previous, next) => ({ forward: { delta: next - previous }, inverse: { delta: previous - next } }),
  apply: (current, patch) => current + patch.delta,
};

test('history: typed delta strategy and nested groups -> applies inverse and forward patches in order', () => {
  const applied: number[] = [];
  const store = history<number, number, { delta: number }>({
    strategy: {
      ...deltaStrategy,
      apply: (current, patch) => { applied.push(patch.delta); return current + patch.delta; },
    },
  })(new Store<number>(0));
  store.group(() => {
    store.set(2);
    store.group(() => { store.set(5); });
  });

  store.undo();
  store.redo();

  expect(applied).toEqual([-3, -2, 5]);
  expect(store.getState()).toBe(5);
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
});

test('history: selected diff strategy while paused -> undo rebases patches and preserves untracked state', () => {
  const store = pipe.use(history({
    select: (state: Readonly<{ count: number; label: string }>) => state.count,
    restore: (current, count) => ({ ...current, count }),
    strategy: deltaStrategy,
  })).create({ count: 0, label: 'initial' });
  store.group(() => {
    store.set({ count: 2, label: 'first' });
    store.set({ count: 5, label: 'second' });
  });
  store.pauseHistory();
  store.set({ count: 10, label: 'untracked' });

  store.undo();
  store.redo();

  expect(store.getState()).toEqual({ count: 10, label: 'untracked' });
  expect(store.getHistoryStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0, isPaused: true });
});

test('history: non-JSON Map selections -> custom patches round-trip without serializing state', () => {
  type MapPatch = readonly (readonly [string, number | undefined])[];
  const strategy: HistoryStrategy<ReadonlyMap<string, number>, MapPatch> = {
    diff: (previous, next) => {
      const keys = [...new Set([...previous.keys(), ...next.keys()])];
      return {
        forward: keys.map(key => [key, next.get(key)] as const),
        inverse: keys.map(key => [key, previous.get(key)] as const),
      };
    },
    apply: (current, patch) => {
      const next = new Map(current);
      for (const [key, value] of patch) {
        if (value === undefined) next.delete(key);
        else next.set(key, value);
      }
      return next;
    },
  };
  const store = pipe.use(history<ReadonlyMap<string, number>, ReadonlyMap<string, number>, MapPatch>({
    strategy,
  })).create(new Map([['a', 1]]));
  store.set(new Map([['b', 2]]));

  store.undo();

  expect([...store.getState()]).toEqual([['a', 1]]);
  store.redo();
  expect([...store.getState()]).toEqual([['b', 2]]);
});

test('history: callable state snapshots -> replay restores functions without calling them as updaters', () => {
  const first = () => 1;
  const second = () => 2;
  const store = pipe.use(history()).create(first);
  store.set(second);

  store.undo();

  expect(store.getState()).toBe(first);
  store.redo();
  expect(store.getState()).toBe(second);
});

test('history metadata: clear pause and resume -> emits frozen snapshots without body changes', () => {
  const store = history()(new Store<number>(0));
  const observed: HistoryStatus[] = [];
  let bodyNotifications = 0;
  store.subscribe(() => { bodyNotifications += 1; });
  const stop = store.subscribeHistory(status => observed.push(status));
  expect(store.getHistoryStatus()).toBe(store.getHistoryStatus());
  expect(observed).toEqual([]);

  store.pauseHistory();
  store.resumeHistory();
  store.clearHistory();
  stop();
  store.clearHistory();

  expect(observed.map(status => status.isPaused)).toEqual([true, false, false]);
  expect(observed.every(Object.isFrozen)).toBe(true);
  expect(bodyNotifications).toBe(0);
});

test('history metadata: duplicate listeners and cancellation -> registrations are independent and delivery is FIFO', () => {
  const store = history()(new Store<number>(0));
  const observed: string[] = [];
  const listener = (status: HistoryStatus) => observed.push(status.isPaused ? 'paused' : 'active');
  const stopFirst = store.subscribeHistory(listener);
  store.subscribeHistory(listener);
  store.subscribeHistory(status => { if (status.isPaused) store.resumeHistory(); });
  stopFirst();

  store.pauseHistory();

  expect(observed).toEqual(['paused', 'active']);
});

test('history metadata: listener throws -> committed history remains usable and other subscribers run', () => {
  const store = history()(new Store<number>(0));
  const observed: number[] = [];
  const stop = store.subscribeHistory(() => { throw new Error('observer failed'); });
  store.subscribeHistory(status => observed.push(status.undoDepth));

  expect(() => store.set(1)).toThrow(AggregateError);
  stop();
  store.undo();

  expect(observed).toEqual([1, 0]);
  expect(store.getState()).toBe(0);
  expect(store.canRedo()).toBe(true);
});

test('history: recording hook throws after commit -> clears incompatible entries and allows later recording', () => {
  let failing = false;
  const store = history<number, number, { delta: number }>({
    strategy: {
      ...deltaStrategy,
      diff: (previous, next) => {
        if (failing) throw new Error('diff failed');
        return deltaStrategy.diff(previous, next);
      },
    },
  })(new Store<number>(0));
  store.set(1);
  failing = true;

  expect(() => store.set(2)).toThrow(AggregateError);

  expect(store.getState()).toBe(2);
  expect(store.canUndo()).toBe(false);
  failing = false;
  store.set(3);
  store.undo();
  expect(store.getState()).toBe(2);
});

test('dispose: active history -> releases entries and observers and leaves ordinary writes usable', () => {
  const store = history()(new Store<number>(0));
  const observed: HistoryStatus[] = [];
  store.subscribeHistory(status => observed.push(status));
  store.set(1);

  dispose(store);
  dispose(store);
  store.set(2);
  store.undo();
  store.pauseHistory();
  store.clearHistory();
  store.subscribeHistory(() => { throw new Error('disposed subscriber ran'); });

  expect(observed).toHaveLength(2);
  expect(store.getHistoryStatus()).toMatchObject({ disposed: true, undoDepth: 0, redoDepth: 0 });
  expect(store.getState()).toBe(2);
});
