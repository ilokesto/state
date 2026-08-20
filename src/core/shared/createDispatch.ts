import type { Store } from '@ilokesto/store';

import { dispatchStoreAction } from '../../lib/actionMetadata.js';
import type { ReducerAction } from '../../types/ReduceFn.js';

/**
 * Create a dispatch function that routes a reducer action through the store's
 * action metadata system.
 *
 * @param store - The target store.
 * @returns A function that dispatches an action to the store.
 */
export function createDispatch<T, Action extends ReducerAction>(
  store: Store<T>,
): (action: Action) => void {
  return (action) => {
    dispatchStoreAction(store, action);
  };
}