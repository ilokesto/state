import type { StoreApi } from '@ilokesto/store';

import type { ReducerAction } from '../types/ReduceFn.js';

export type StoreActionMetadata = Readonly<{
  /** Action type associated with the store's current synchronous operation. */
  type: string;
}>;

const actionMetadataByStore = new WeakMap<object, StoreActionMetadata>();
const dispatchedActionByStore = new WeakMap<object, ReducerAction>();

/**
 * @description Runs a callback synchronously with action metadata associated with
 * the store. Restores the previous metadata afterward, including when the callback
 * throws, and propagates its return value or exception. If the callback returns a
 * promise, metadata is restored before that promise settles.
 * @param {StoreApi<T>} store - Store whose metadata is temporarily set.
 * @param {StoreActionMetadata} metadata - Metadata visible during the callback.
 * @param {string} metadata.type - Action type identifying the operation.
 * @param {() => Result} fn - Callback to invoke while the metadata is active.
 * @returns {Result} The callback's return value, unchanged.
 * @example
 * ```ts
 * const activeType = runWithStoreActionMetadata(
 *   store,
 *   { type: 'counter/increment' },
 *   () => getStoreActionMetadata(store)?.type,
 * );
 * // activeType === 'counter/increment'; previous metadata is now restored.
 * ```
 */
export function runWithStoreActionMetadata<T, Result>(
  store: StoreApi<T>,
  metadata: StoreActionMetadata,
  fn: () => Result,
): Result {
  const previousMetadata = actionMetadataByStore.get(store);
  actionMetadataByStore.set(store, metadata);

  try {
    return fn();
  } finally {
    if (previousMetadata) {
      actionMetadataByStore.set(store, previousMetadata);
    } else {
      actionMetadataByStore.delete(store);
    }
  }
}

/**
 * @description Reads the metadata currently associated with the store by
 * runWithStoreActionMetadata or dispatchStoreAction.
 * @param {StoreApi<T>} store - Store whose active metadata to read.
 * @returns {StoreActionMetadata | undefined} Active metadata, or undefined when
 * no metadata scope is active for the store.
 * - type `string` - Action type identifying the active operation.
 * @example
 * ```ts
 * runWithStoreActionMetadata(store, { type: 'counter/reset' }, () => {
 *   console.log(getStoreActionMetadata(store)?.type); // 'counter/reset'
 * });
 * ```
 */
export function getStoreActionMetadata<T>(store: StoreApi<T>): StoreActionMetadata | undefined {
  return actionMetadataByStore.get(store);
}

/**
 * @description Reads the action currently being dispatched synchronously through
 * dispatchStoreAction. Nested dispatches temporarily replace the active action.
 * @param {StoreApi<T>} store - Store whose active dispatched action to read.
 * @returns {ReducerAction | undefined} The active action, or undefined when no
 * dispatchStoreAction call is active for the store.
 * - type `string` - Type of the active dispatched action.
 * @example
 * ```ts
 * const unsubscribe = store.subscribe(() => {
 *   console.log(getDispatchedStoreAction(store)?.type);
 * });
 * dispatchStoreAction(store, { type: 'counter/reset' });
 * unsubscribe();
 * ```
 */
export function getDispatchedStoreAction<T>(store: StoreApi<T>): ReducerAction | undefined {
  return dispatchedActionByStore.get(store);
}

/**
 * @description Calls the store's setState method with the action as its argument
 * and the store as its receiver. Exposes the action and its type metadata during
 * the synchronous call, then restores any previous action and metadata even if
 * setState throws. Exceptions propagate to the caller; the setState return value
 * is discarded. The store must support receiving reducer actions through setState.
 * @param {StoreApi<T>} store - Store configured to accept reducer actions.
 * @param {Action} action - Action passed unchanged to the store's setState method.
 * @example
 * ```ts
 * // With a store configured to handle the counter/reset action:
 * dispatchStoreAction(store, { type: 'counter/reset' });
 * ```
 */
export function dispatchStoreAction<T, Action extends ReducerAction>(
  store: StoreApi<T>,
  action: Action,
): void {
  const previousAction = dispatchedActionByStore.get(store);
  dispatchedActionByStore.set(store, action);

  try {
    runWithStoreActionMetadata(store, { type: action.type }, () => {
      Reflect.apply(store.setState, store, [action]);
    });
  } finally {
    if (previousAction) {
      dispatchedActionByStore.set(store, previousAction);
    } else {
      dispatchedActionByStore.delete(store);
    }
  }
}
