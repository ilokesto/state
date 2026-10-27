import { expect, spyOn, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { getStoreActionMetadata, type StoreActionMetadata } from '../../src/lib/actionMetadata';
import { create as createSvelteStore } from '../../src/core/Svelte';
import { logger } from '../../src/middleware/logger';
import { pipe } from '../../src/utils/pipe';
import type { ReduceFn } from '../../src/types/ReduceFn';

type CounterState =
  | Readonly<{ kind: 'active'; count: number }>
  | Readonly<{ kind: 'idle'; count: 0 }>;

interface IncrementAction {
  readonly type: 'increment';
  readonly amount: number;
}

interface CrashAction {
  readonly type: 'crash';
}

interface OuterAction {
  readonly type: 'outer';
}

interface InnerAction {
  readonly type: 'inner';
}

type CounterAction = IncrementAction | CrashAction | OuterAction | InnerAction;

const reduceCounter: ReduceFn<CounterState, CounterAction> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return state.kind === 'active'
        ? { kind: 'active', count: state.count + action.amount }
        : { kind: 'active', count: action.amount };
    case 'crash':
      throw new Error('reducer exploded');
    case 'outer':
      return state.kind === 'active'
        ? { kind: 'active', count: state.count + 1 }
        : { kind: 'active', count: 1 };
    case 'inner':
      return state.kind === 'active'
        ? { kind: 'active', count: state.count + 10 }
        : { kind: 'active', count: 10 };
  }
};

test('Given a reducer store, when an action is dispatched, then it transforms state and exposes metadata only during dispatch', () => {
  // Given
  const store = new Store<CounterState>({ kind: 'active', count: 1 });
  const reducerStore = createSvelteStore(reduceCounter, store);
  const observedMetadata: Array<StoreActionMetadata | undefined> = [];
  const action: CounterAction = { type: 'increment', amount: 2 };

  store.pushMiddleware((nextState, next) => {
    observedMetadata.push(getStoreActionMetadata(store));
    next(nextState);
  });

  // When
  reducerStore.dispatch(action);

  // Then
  expect(store.getState()).toEqual({ kind: 'active', count: 3 });
  expect(observedMetadata).toEqual([{ type: 'increment' }]);
  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given reducer middleware, when it dispatches a nested action, then inner metadata is scoped and outer metadata is restored', () => {
  // Given
  const store = new Store<CounterState>({ kind: 'active', count: 0 });
  const reducerStore = createSvelteStore(reduceCounter, store);
  const outerAction: CounterAction = { type: 'outer' };
  const innerAction: CounterAction = { type: 'inner' };
  const metadataSequence: string[] = [];
  let hasDispatchedInnerAction = false;
  let metadataAfterNestedDispatch: StoreActionMetadata | undefined;

  store.pushMiddleware((nextState, next) => {
    metadataSequence.push(getStoreActionMetadata(store)?.type ?? 'missing');

    if (!hasDispatchedInnerAction) {
      hasDispatchedInnerAction = true;
      next(nextState);
      reducerStore.dispatch(innerAction);
      metadataAfterNestedDispatch = getStoreActionMetadata(store);
      metadataSequence.push(metadataAfterNestedDispatch?.type ?? 'missing');
      return;
    }

    next(nextState);
  });

  // When
  reducerStore.dispatch(outerAction);

  // Then
  expect(store.getState()).toEqual({ kind: 'active', count: 11 });
  expect(metadataSequence).toEqual(['outer', 'inner', 'outer']);
  expect(metadataAfterNestedDispatch).toEqual({ type: 'outer' });
  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given a reducer that throws, when an action is dispatched, then action metadata is cleaned up', () => {
  // Given
  const store = new Store<CounterState>({ kind: 'active', count: 1 });
  const reducerStore = createSvelteStore(reduceCounter, store);
  const action: CounterAction = { type: 'crash' };

  // When
  const dispatch = () => reducerStore.dispatch(action);

  // Then
  expect(dispatch).toThrow('reducer exploded');
  expect(store.getState()).toEqual({ kind: 'active', count: 1 });
  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given a reducer store, when direct or functional state updates run, then they bypass reducer metadata', () => {
  // Given
  const store = new Store<CounterState>({ kind: 'active', count: 1 });
  createSvelteStore(reduceCounter, store);
  const observedMetadata: Array<StoreActionMetadata | undefined> = [];
  const replacement: CounterState = { kind: 'idle', count: 0 };

  store.pushMiddleware((nextState, next) => {
    observedMetadata.push(getStoreActionMetadata(store));
    next(nextState);
  });

  // When
  store.setState(replacement);
  store.setState((state) =>
    state.kind === 'idle' ? { kind: 'active', count: 5 } : { kind: 'active', count: state.count + 5 },
  );

  // Then
  expect(store.getState()).toEqual({ kind: 'active', count: 5 });
  expect(observedMetadata).toEqual([undefined, undefined]);
  expect(getStoreActionMetadata(store)).toBeUndefined();
});

test('Given logger middleware, when a reducer action is followed by a plain update, then only the action receives a reducer label', () => {
  // Given
  const loggedStore = pipe.use(logger({ timestamp: false })).create<CounterState>({ kind: 'active', count: 1 });
  const reducerStore = createSvelteStore(reduceCounter, loggedStore);
  const action: CounterAction = { type: 'increment', amount: 1 };
  const replacement: CounterState = { kind: 'idle', count: 0 };

  const labels: string[] = [];
  const groupSpy = spyOn(console, 'group').mockImplementation((...args: readonly unknown[]) => {
    labels.push(String(args[0]));
  });
  const logSpy = spyOn(console, 'log').mockImplementation(() => undefined);
  const groupEndSpy = spyOn(console, 'groupEnd').mockImplementation(() => undefined);

  try {
    // When
    reducerStore.dispatch(action);
    loggedStore.setState(replacement);

    // Then
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('increment');
    expect(labels[1]).toContain('anonymous action');
    expect(getStoreActionMetadata(loggedStore)).toBeUndefined();
  } finally {
    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  }
});
