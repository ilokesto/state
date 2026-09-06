import type { Store, StoreApi } from '@ilokesto/store';
import type { ReducerState } from '../../lib/createReducer.js';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseComposable } from './createUseComposable.js';

/**
 * Create a Vue composable from plain state or a reducer.
 *
 * Returns a function that must be called inside `setup()` or an active
 * `effectScope()`. Without a selector, `state` is a `ComputedRef` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * Create a Vue composable from plain state or a reducer.
 *
 * Returns a function that must be called inside `setup()` or an active
 * `effectScope()`. Without a selector, `state` is a `ComputedRef` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseComposable<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/** Bind an existing structural store without recreating or inspecting its value. */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createUseComposable<T, never>(store, false);
}

/** Bind an explicit reducer handle without registering the reducer again. */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createUseComposable<T, Action>(state.store, true, state.dispatch);
}
