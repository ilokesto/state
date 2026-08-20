import type { Store } from '@ilokesto/store';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createStore } from './createStore.js';

export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

export function create<T>(initialState: T | Store<T>): UseState<T>;

/**
 * Create a Svelte store from plain state or a reducer.
 *
 * Returns a writable Svelte store with `subscribe`, `set`, `update`,
 * `select`, `writeOnly()`, and `readOnly()`. For reducer state, returns a
 * readable store with `dispatch` instead of `set`/`update`.
 */
export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createStore<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
