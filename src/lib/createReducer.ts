import type { Store, StoreApi } from '@ilokesto/store';
import type { ReduceFn, ReducerAction } from '../types/ReduceFn.js';
import { dispatchStoreAction } from './actionMetadata.js';
import { getStore } from './getStore.js';

/** A reducer owns one store and an explicit, stable action dispatcher. */
export type ReducerState<T, Action extends ReducerAction> = {
  /** The store holding the reducer's current state. */
  readonly store: StoreApi<T>;
  /** Dispatches an action through the store's action-metadata handling. */
  readonly dispatch: (action: Action) => void;
};

/**
 * @description Registers a reducer once, preserving middleware action metadata
 * and store identity. Uses an existing store when supplied, or obtains a store
 * for the initial state, and returns it with an explicit, stable dispatcher.
 * @param {ReduceFn<T, Action>} reducer - Reducer used to process dispatched actions.
 * @param {T | Store<T>} initialState - Initial state or an existing store to reuse.
 * @returns {(ReducerState<T, Action> & { readonly store: Existing }) | ReducerState<T, Action>}
 * The store and its action dispatcher. Passing an existing store preserves its
 * specific type in the returned store property.
 * - store `StoreApi<T> | Existing` - The state store; the supplied store is reused when provided.
 * - dispatch `(action: Action) => void` - Dispatches an action while preserving middleware action metadata.
 * @example
 * ```ts
 * const counter = createReducer(
 *   (state: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? state + 1 : state,
 *   0,
 * );
 *
 * counter.dispatch({ type: 'increment' });
 * ```
 */
export function createReducer<T, Action extends ReducerAction, Existing extends Store<T>>(
  reducer: ReduceFn<T, Action>,
  initialState: Existing,
): ReducerState<T, Action> & { readonly store: Existing };
/**
 * @description Registers a reducer once, preserving middleware action metadata
 * and store identity. Uses an existing store when supplied, or obtains a store
 * for the initial state, and returns it with an explicit, stable dispatcher.
 * @param {ReduceFn<T, Action>} reducer - Reducer used to process dispatched actions.
 * @param {T | Store<T>} initialState - Initial state or an existing store to reuse.
 * @returns {(ReducerState<T, Action> & { readonly store: Existing }) | ReducerState<T, Action>}
 * The store and its action dispatcher. Passing an existing store preserves its
 * specific type in the returned store property.
 * - store `StoreApi<T> | Existing` - The state store; the supplied store is reused when provided.
 * - dispatch `(action: Action) => void` - Dispatches an action while preserving middleware action metadata.
 * @example
 * ```ts
 * const counter = createReducer(
 *   (state: number, action: { type: 'increment' }) =>
 *     action.type === 'increment' ? state + 1 : state,
 *   0,
 * );
 *
 * counter.dispatch({ type: 'increment' });
 * ```
 */
export function createReducer<T, Action extends ReducerAction>(
  reducer: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): ReducerState<T, Action>;
export function createReducer<T, Action extends ReducerAction>(
  reducer: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): ReducerState<T, Action> {
  const store = getStore(initialState, reducer);
  return {
    store,
    dispatch: (action) => dispatchStoreAction(store, action),
  };
}
