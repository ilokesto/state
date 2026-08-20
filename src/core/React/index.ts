import type { Store } from '@ilokesto/store';
import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseState } from './createUseState.js';

export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

export function create<T>(initialState: T | Store<T>): UseState<T>;

/**
 * Create a React state hook from plain state or a reducer.
 *
 * Returns a hook compatible with `useSyncExternalStore`. Call it with a
 * selector to subscribe to a slice; call without arguments to read the full
 * state. Use `.writeOnly()` or `.readOnly()` for lifecycle-independent access.
 */
export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseState<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
