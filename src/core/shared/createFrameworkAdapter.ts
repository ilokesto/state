import type { Store, StoreApi } from '@ilokesto/store';

import { getStore } from '../../lib/getStore.js';
import { createReducer } from '../../lib/createReducer.js';
import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import { getInitialState } from './getInitialState.js';

type FrameworkAdapterArguments<T, Action extends ReducerAction> = Readonly<{
  firstArg: Store<T> | T | ReduceFn<T, Action>;
  secondArg: T | Store<T> | undefined;
  isReduce: boolean;
}>;

export function createFrameworkAdapter<T, Action extends ReducerAction, Adapter>(
  createAdapter: (store: StoreApi<T>, isReduce: boolean, dispatch?: (action: Action) => void) => Adapter,
  { firstArg, secondArg, isReduce }: FrameworkAdapterArguments<T, Action>,
): Adapter {
  const initialState = getInitialState(firstArg, secondArg, isReduce).initialState;
  if (isReduce) {
    const state = createReducer(firstArg as ReduceFn<T, Action>, initialState);
    return createAdapter(state.store, true, state.dispatch);
  }
  return createAdapter(getStore(initialState), false);
}
