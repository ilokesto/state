import { Store } from '@ilokesto/store';

import type { ReduceFn } from '../../types/ReduceFn';

export function getInitialState<T, Action extends object>(
  firstArg: T | Store<T> | ReduceFn<T, Action>,
  secondArg?: T | Store<T>,
): { initialState: T | Store<T>; isReduce: boolean } {
  if (typeof firstArg === 'function') {
    return { initialState: secondArg as T | Store<T>, isReduce: true };
  }

  return { initialState: firstArg, isReduce: false };
}
