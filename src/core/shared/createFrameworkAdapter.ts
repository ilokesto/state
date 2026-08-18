import type { Store } from '@ilokesto/store';

import { getStore } from '../../lib/getStore.js';
import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';
import { getInitialState } from './getInitialState.js';

type FrameworkAdapterArguments<T, Action extends ReducerAction> = Readonly<{
  firstArg: Store<T> | T | ReduceFn<T, Action>;
  secondArg: T | Store<T> | undefined;
  isReduce: boolean;
}>;

export function createFrameworkAdapter<T, Action extends ReducerAction, Adapter>(
  createAdapter: (store: Store<T>, isReduce: boolean) => Adapter,
  { firstArg, secondArg, isReduce }: FrameworkAdapterArguments<T, Action>,
): Adapter {
  const initialState = getInitialState(firstArg, secondArg, isReduce).initialState;
  const reduceFn = isReduce ? (firstArg as ReduceFn<T, Action>) : undefined;

  return createAdapter(getStore(initialState, reduceFn), isReduce);
}
