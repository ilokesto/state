import type { Store, StoreApi } from '@ilokesto/store';

import { getStore } from '../../lib/getStore.js';
import { createReducer } from '../../lib/createReducer.js';
import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';

type FrameworkAdapterArguments<T, Action extends ReducerAction> = Readonly<{
  /** Initial state or an existing store in direct mode; the reducer in reducer mode. */
  firstArg: Store<T> | T | ReduceFn<T, Action>;
  /** Initial state or an existing store for reducer mode; ignored in direct mode. */
  secondArg: T | Store<T> | undefined;
  /** Whether to interpret the arguments as a reducer and its initial state. */
  isReduce: boolean;
}>;

/**
 * @description Creates a framework adapter from initial state or an existing store.
 * In reducer mode, creates reducer-backed state and supplies its dispatch function
 * to the adapter factory. In direct mode, resolves the state to a store and calls
 * the factory without a dispatch argument.
 * @param {(store: StoreApi<T>, isReduce: boolean, dispatch?: (action: Action) => void) => Adapter} createAdapter - Factory receiving the resolved store, the mode flag, and dispatch in reducer mode.
 * @param {FrameworkAdapterArguments<T, Action>} options - State source and mode selection.
 * @param {T | Store<T> | ReduceFn<T, Action>} options.firstArg - Initial state or an existing store when isReduce is false; the reducer when true.
 * @param {T | Store<T> | undefined} options.secondArg - Initial state or an existing store in reducer mode; ignored in direct mode.
 * @param {boolean} options.isReduce - Whether to create reducer-backed state and provide dispatch.
 * @returns {Adapter} The value returned by the adapter factory.
 * @example
 * ```ts
 * const adapter = createFrameworkAdapter(
 *   (store, isReduce) => ({ store, isReduce }),
 *   {
 *     firstArg: { count: 0 },
 *     secondArg: undefined,
 *     isReduce: false,
 *   },
 * );
 * // adapter.store is the resolved store; adapter.isReduce is false.
 * ```
 */
export function createFrameworkAdapter<T, Action extends ReducerAction, Adapter>(
  createAdapter: (store: StoreApi<T>, isReduce: boolean, dispatch?: (action: Action) => void) => Adapter,
  { firstArg, secondArg, isReduce }: FrameworkAdapterArguments<T, Action>,
): Adapter {
  const initialState = (isReduce ? secondArg : firstArg) as T | Store<T>;
  if (isReduce) {
    const state = createReducer(firstArg as ReduceFn<T, Action>, initialState);
    return createAdapter(state.store, true, state.dispatch);
  }
  return createAdapter(getStore(initialState), false);
}
