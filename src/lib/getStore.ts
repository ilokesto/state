import { Store } from '@ilokesto/store';
import { ReduceFn } from '../types/ReduceFn';

const isStore = <T>(initialValue: T | Store<T>): initialValue is Store<T> => {
  return initialValue instanceof Store;
};

export const getStore = <T, Action extends { type: string; [x: PropertyKey]: any }>(
  initState: T | Store<T>,
  reduceFn?: ReduceFn<T, Action>,
): Store<T> => {
  const store = isStore(initState) ? initState : new Store(initState);

  if (reduceFn) {
    store.unshiftMiddleware((nextState: any, next) => {
      const action: Action = nextState as unknown as Action;
      // @ts-ignore
      store.actionName = action.type;
      const currentState = store.getState();
      next(reduceFn(currentState, action));
      // @ts-ignore
      store.actionName = undefined;
    });
  }

  return store;
};
