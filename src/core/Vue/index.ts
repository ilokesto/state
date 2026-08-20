import type { Store } from '@ilokesto/store';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseComposable } from './createUseComposable.js';

export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

export function create<T>(initialState: T | Store<T>): UseState<T>;

/**
 * Create a Vue composable from plain state or a reducer.
 *
 * Returns a function that must be called inside `setup()` or an active
 * `effectScope()`. Returns `{ state, setState }` or `{ state, dispatch }`.
 * Use `.writeOnly()` or `.readOnly()` for lifecycle-independent access.
 */
export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseComposable<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
