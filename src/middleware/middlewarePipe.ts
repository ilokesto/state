import { Store } from '@ilokesto/store';
import { getStore } from '../lib/getStoreFromProps';
import type { PipeMiddleware, StoreInput } from './shared';

export const middlewarePipe = <T>(
  initialState: StoreInput<T>,
  middlewares: Array<PipeMiddleware<T>>,
): Store<T> => {
  return middlewares.reduce((store, middleware) => middleware(store), getStore(initialState));
};
