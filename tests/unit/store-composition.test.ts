import { expect, test } from 'bun:test';
import { join } from 'node:path';
import * as registry from '@ilokesto/store';
import * as state from '@ilokesto/state';
import { history, dispose } from '@ilokesto/state/middleware';
import { pipe } from '@ilokesto/state/utils';
import { compileTypeFiles } from '../fixtures/helpers/compileTypeFiles';

test('store composition exports: registry functions -> retain one implementation and scheduler', () => {
  for (const name of [
    'batch', 'derived', 'focus', 'createStoreFamily', 'memoizeSelector',
    'trackedDerived', 'withLifecycle',
  ] as const) {
    expect(state[name]).toBe(registry[name]);
  }
});

test('registry composition: focused batched writes through history -> settles derived output while retaining each commit', () => {
  const parent = pipe.use(history()).create({ count: 1, label: 'keep' });
  const count = state.focus(parent, value => value.count, (value, count) => ({ ...value, count }));
  const doubled = state.derived(count, value => value * 2);
  const combined = state.derived([count, doubled] as const, values => values);
  const seen: Array<readonly [number, number]> = [];
  const stop = combined.subscribeSelector(value => value, value => seen.push(value));
  try {
    state.batch(() => {
      count.update(value => value + 1);
      count.update(value => value + 1);
      expect(seen).toEqual([]);
    });

    expect(parent.getState()).toEqual({ count: 3, label: 'keep' });
    expect(seen).toEqual([[3, 6]]);
    expect(parent.getHistoryStatus().undoDepth).toBe(2);
    parent.undo();
    expect(combined.getState()).toEqual([2, 4]);
    expect(seen).toEqual([[3, 6], [2, 4]]);
  } finally {
    stop();
    combined.dispose();
    doubled.dispose();
    count.dispose();
    dispose(parent);
  }
});

test('store composition declarations: public registry-backed views -> infer five readonly adapter contracts', () => {
  const result = compileTypeFiles([join(import.meta.dir, '..', 'fixtures/store-composition-contracts.ts')]);

  expect(result.success, result.diagnostics).toBe(true);
});
