import type { Store } from '@ilokesto/store';
import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseState } from './createUseState.js';

/**
 * Create a React state hook from plain state or a reducer.
 *
 * Returns a hook compatible with `useSyncExternalStore`. Call it with a
 * selector to subscribe to a slice; call without arguments to receive a
 * read-only first tuple item. Object state is `Readonly<T>`; callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * Create a React state hook from plain state or a reducer.
 *
 * Returns a hook compatible with `useSyncExternalStore`. Call it with a
 * selector to subscribe to a slice; call without arguments to receive a
 * read-only first tuple item. Object state is `Readonly<T>`; callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T>(initialState: T | Store<T>): UseState<T>;

export function create<T, Action extends ReducerAction>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
) {
  return createFrameworkAdapter(
    createUseState<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
