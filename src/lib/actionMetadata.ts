import type { StoreApi } from '@ilokesto/store';

import type { ReducerAction } from '../types/ReduceFn.js';

export type StoreActionMetadata = Readonly<{
  type: string;
}>;

const actionMetadataByStore = new WeakMap<object, StoreActionMetadata>();
const dispatchedActionByStore = new WeakMap<object, ReducerAction>();

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

export function getStoreActionMetadata<T>(store: StoreApi<T>): StoreActionMetadata | undefined {
  return actionMetadataByStore.get(store);
}

export function getDispatchedStoreAction<T>(store: StoreApi<T>): ReducerAction | undefined {
  return dispatchedActionByStore.get(store);
}

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
