import { Store } from '@ilokesto/store';
import type { ReduceFn } from '../types/ReduceFn';

const isMiddlewareStore = <T>(initialValue: T | Store<T>): initialValue is Store<T> => {
  return (
    typeof initialValue === 'object' &&
    Reflect.has(initialValue as object, 'getState') &&
    Reflect.has(initialValue as object, 'setState')
  );
};

export const getStore = <T, Action extends { type: string; [x: PropertyKey]: any }>(
  initState: T | Store<T>,
  reduceFn?: ReduceFn<T, Action>,
) => setDispatcher(isMiddlewareStore(initState) ? initState : new Store(initState), reduceFn);

const setDispatcher = <T, Action extends { type: string; [x: PropertyKey]: any }>(
  store: Store<T>,
  reduceFn?: ReduceFn<T, Action>,
): Store<T> => {
  if (reduceFn) {
    const setState = (action: Action) => {
      // @ts-ignore
      store.setState((prev) => reduceFn(prev, action), action.type);
    };

    return { ...store, setState } as unknown as Store<T>;
  } else {
    return store;
  }
};
