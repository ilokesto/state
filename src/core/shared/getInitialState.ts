import { Store } from '@ilokesto/store';

import type { ReduceFn, ReducerAction } from '../../types/ReduceFn.js';

export function getInitialState<T, Action extends ReducerAction>(
  firstArg: T | Store<T> | ReduceFn<T, Action>,
  secondArg: T | Store<T> | undefined,
  isReduce: boolean,
): { initialState: T | Store<T>; isReduce: boolean } {
  if (isReduce) {
    return { initialState: secondArg as T | Store<T>, isReduce: true };
  }

  return { initialState: firstArg as T | Store<T>, isReduce: false };
}
