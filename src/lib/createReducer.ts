import type { Store, StoreApi } from '@ilokesto/store';
import type { ReduceFn, ReducerAction } from '../types/ReduceFn.js';
import { dispatchStoreAction } from './actionMetadata.js';
import { getStore } from './getStore.js';

/** A reducer owns one store and an explicit, stable action dispatcher. */
export type ReducerState<T, Action extends ReducerAction> = {
  readonly store: StoreApi<T>;
  readonly dispatch: (action: Action) => void;
};

/** Register a reducer once, preserving middleware action metadata and store identity. */
export function createReducer<T, Action extends ReducerAction, Existing extends Store<T>>(
  reducer: ReduceFn<T, Action>,
  initialState: Existing,
): ReducerState<T, Action> & { readonly store: Existing };
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
