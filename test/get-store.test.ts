import { expect, spyOn, test } from 'bun:test';
import { Store } from '@ilokesto/store';

import { create as createSvelteStore } from '../src/core/Svelte';
import { dispatchStoreAction } from '../src/lib/actionMetadata';
import { getStore } from '../src/lib/getStore';
import type { ReduceFn } from '../src/types/ReduceFn';

interface MethodNamedState {
  readonly label: string;
  readonly getState: () => string;
  readonly getInitialState: () => string;
  readonly setState: () => void;
  readonly pushMiddleware: () => void;
  readonly unshiftMiddleware: () => void;
  readonly subscribe: () => void;
}

interface TypedState {
  readonly type: 'ready';
  readonly count: number;
}

interface IncrementAction {
  readonly type: 'increment';
  readonly amount: number;
}

interface CrashAction {
  readonly type: 'crash';
}

type CounterAction = IncrementAction | CrashAction;

test('Given plain state with Store-shaped method names, when getStore receives it, then it wraps the state in a real Store', () => {
  // Given
  const state: MethodNamedState = {
    label: 'plain state',
    getState: () => 'not a Store',
    getInitialState: () => 'not a Store',
    setState: () => undefined,
    pushMiddleware: () => undefined,
    unshiftMiddleware: () => undefined,
    subscribe: () => undefined,
  };

  // When
  const store = getStore(state);

  // Then
  expect(store).toBeInstanceOf(Store);
  expect(store.getState()).toBe(state);
});

test('Given reducer-backed state with a string type field, when it is replaced directly, then the reducer is not invoked', () => {
  // Given
  const store = new Store<TypedState>({ type: 'ready', count: 1 });
  const reducerActions: CounterAction[] = [];
  const reduceTypedState: ReduceFn<TypedState, CounterAction> = (state, action) => {
    reducerActions.push(action);

    if (action.type === 'increment') {
      return { type: 'ready', count: state.count + action.amount };
    }

    throw new Error('reducer exploded');
  };
  const replacement: TypedState = { type: 'ready', count: 9 };
  createSvelteStore(reduceTypedState, store);

  // When
  store.setState(replacement);

  // Then
  expect(store.getState()).toEqual(replacement);
  expect(reducerActions).toEqual([]);
});

test('Given one Store and one reducer identity, when getStore registers it twice and dispatches once, then the reducer runs once', () => {
  // Given
  type IdentityStateAction = Readonly<{ type: 'increment'; count: number }>;
  const store = new Store<IdentityStateAction>({ type: 'increment', count: 1 });
  const middlewareSpy = spyOn(store, 'unshiftMiddleware');
  let reducerCalls = 0;
  const reducer: ReduceFn<IdentityStateAction, IdentityStateAction> = (_state, action) => {
    reducerCalls += 1;
    return action;
  };
  getStore(store, reducer);
  getStore(store, reducer);

  // When
  dispatchStoreAction(store, { type: 'increment', count: 3 });

  // Then
  expect(reducerCalls).toBe(1);
  expect(middlewareSpy).toHaveBeenCalledTimes(1);
  expect(store.getState()).toEqual({ type: 'increment', count: 3 });
  middlewareSpy.mockRestore();
});

test('Given a Store with a reducer, when a different reducer identity is registered, then it throws before changing reducer behavior or state', () => {
  // Given
  const initialState: TypedState = { type: 'ready', count: 1 };
  const store = new Store<TypedState>(initialState);
  let firstReducerCalls = 0;
  let conflictingReducerCalls = 0;
  const firstReducer: ReduceFn<TypedState, IncrementAction> = (state, action) => {
    firstReducerCalls += 1;
    return { ...state, count: state.count + action.amount };
  };
  const conflictingReducer: ReduceFn<TypedState, IncrementAction> = (state, action) => {
    conflictingReducerCalls += 1;
    return { ...state, count: state.count + action.amount * 10 };
  };
  getStore(store, firstReducer);

  // When
  const registerConflictingReducer = () => getStore(store, conflictingReducer);

  // Then
  expect(registerConflictingReducer).toThrow(
    new TypeError('Cannot register a different reducer for the same Store.'),
  );
  expect(store.getState()).toBe(initialState);

  dispatchStoreAction(store, { type: 'increment', amount: 2 });
  expect(firstReducerCalls).toBe(1);
  expect(conflictingReducerCalls).toBe(0);
  expect(store.getState()).toEqual({ type: 'ready', count: 3 });
});
