import { Store } from '@ilokesto/store';
import { getDispatchedStoreAction } from './actionMetadata.js';
import type { ReduceFn, ReducerAction } from '../types/ReduceFn.js';

type StoreSetStateAction<T> = Parameters<Store<T>['setState']>[0];

const reducerByStore = new WeakMap<object, (...args: never[]) => unknown>();

const isStore = <T>(initialValue: T | Store<T>): initialValue is Store<T> => {
  return initialValue instanceof Store;
};

export const isStoreAction = <T, Action extends ReducerAction>(
  store: Store<T>,
  value: unknown,
): value is Action => {
  return getDispatchedStoreAction(store) === value;
};

export const getStore = <T, Action extends ReducerAction>(
  initState: T | Store<T>,
  reduceFn?: ReduceFn<T, Action>,
): Store<T> => {
  const store = isStore(initState) ? initState : new Store(initState);

  if (reduceFn) {
    const registeredReducer = reducerByStore.get(store);

    if (registeredReducer !== undefined) {
      if (registeredReducer !== reduceFn) {
        throw new TypeError('Cannot register a different reducer for the same Store.');
      }

      return store;
    }

    store.unshiftMiddleware((nextState: StoreSetStateAction<T>, next) => {
      if (!isStoreAction<T, Action>(store, nextState)) {
        next(nextState);
        return;
      }

      const currentState = store.getState();
      next(reduceFn(currentState, nextState));
    });
    reducerByStore.set(store, reduceFn);
  }

  return store;
};
