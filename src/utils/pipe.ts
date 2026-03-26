import { Store } from '@ilokesto/store';

export const pipe = <T>(
  initialState: T,
  ...middlewares: Array<(store: Store<T>) => Store<T>>
): Store<T> => {
  return middlewares.reduce((store, middleware) => middleware(store), new Store(initialState));
};
