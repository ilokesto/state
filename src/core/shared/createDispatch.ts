import type { StoreApi } from '@ilokesto/store';

import { dispatchStoreAction } from '../../lib/actionMetadata.js';
import type { ReducerAction } from '../../types/ReduceFn.js';

/**
 * @description Creates a dispatch function that routes a reducer action through
 * the store's action metadata system.
 * @param {StoreApi<T>} store - The store to which actions are dispatched.
 * @returns {(action: Action) => void} A function that dispatches an action to the
 * store through its action metadata system and returns no value.
 * @example
 * ```ts
 * const dispatch = createDispatch<
 *   ReturnType<typeof store.getState>,
 *   { type: 'increment' }
 * >(store);
 * dispatch({ type: 'increment' });
 * ```
 */
export function createDispatch<T, Action extends ReducerAction>(
  store: StoreApi<T>,
): (action: Action) => void {
  return (action) => {
    dispatchStoreAction(store, action);
  };
}
