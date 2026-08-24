import type { Store } from '@ilokesto/store';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseAccessor } from './createUseAccessor.js';

/**
 * Create a Solid accessor from plain state or a reducer.
 *
 * Returns a function that must be called inside a reactive owner (component
 * or `createRoot()`). Without a selector, `state` is an `Accessor` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * Create a Solid accessor from plain state or a reducer.
 *
 * Returns a function that must be called inside a reactive owner (component
 * or `createRoot()`). Without a selector, `state` is an `Accessor` of a
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
    createUseAccessor<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
