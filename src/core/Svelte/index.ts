import type { Store, StoreApi } from '@ilokesto/store';
import type { ReducerState } from '../../lib/createReducer.js';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createStore } from './createStore.js';

/**
 * Create a Svelte store from plain state or a reducer.
 *
 * Returns a writable Svelte store with `subscribe`, `set`, `update`,
 * `select`, `writeOnly()`, and `readOnly()`. Full-store subscriptions,
 * selectors, and `.readOnly()` receive snapshots: object state is `Readonly<T>`,
 * while callable state remains exact `T`, including its declared own-property
 * modifiers. For reducer state, returns a readable store with `dispatch`
 * instead of `set`/`update`.
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * Create a Svelte store from plain state or a reducer.
 *
 * Returns a writable Svelte store with `subscribe`, `set`, `update`,
 * `select`, `writeOnly()`, and `readOnly()`. Full-store subscriptions,
 * selectors, and `.readOnly()` receive snapshots: object state is `Readonly<T>`,
 * while callable state remains exact `T`, including its declared own-property
 * modifiers. For reducer state, returns a readable store with `dispatch`
 * instead of `set`/`update`.
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createStore<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}

/** Bind an existing structural store without recreating or inspecting its value. */
export function bind<T>(store: StoreApi<T>): UseState<T>;
export function bind<T>(store: StoreApi<T>) {
  return createStore<T, never>(store, false);
}

/** Bind an explicit reducer handle without registering the reducer again. */
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>): UseReducer<T, Action>;
export function bindReducer<T, Action extends ReducerAction>(state: ReducerState<T, Action>) {
  return createStore<T, Action>(state.store, true, state.dispatch);
}
