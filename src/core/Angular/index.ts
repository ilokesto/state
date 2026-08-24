import type { Store } from '@ilokesto/store';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import type { UseReducer, UseState } from './types.js';
export type { AngularOptions, UseReducer, UseState } from './types.js';

import { createFrameworkAdapter } from '../shared/createFrameworkAdapter.js';
import { createUseSignal } from './createUseSignal.js';

/**
 * Create an Angular signal from plain state or a reducer.
 *
 * Returns a function that must be called inside an injection context or with
 * an explicit `{ destroyRef }`. Without a selector, `state` is a `Signal` of a
 * read-only snapshot: object state is `Readonly<T>`, while callable state
 * remains exact `T`, including its declared own-property modifiers. Selectors
 * and `.readOnly()` use the same snapshot.
 */
export function create<T, Action extends ReducerAction>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

/**
 * Create an Angular signal from plain state or a reducer.
 *
 * Returns a function that must be called inside an injection context or with
 * an explicit `{ destroyRef }`. Without a selector, `state` is a `Signal` of a
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
    createUseSignal<T, Action>,
    { firstArg, secondArg, isReduce: arguments.length === 2 },
  );
}
