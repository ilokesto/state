import { Store } from '@ilokesto/store';
import type { ReduceFn } from '../../types/ReduceFn';

export function getInitialState<T, Action extends object>(
  firstArg: T | Store<T> | ReduceFn<T, Action>,
  secondArg?: T,
): { initialState: T; isReduce: boolean } {
  if (typeof firstArg === 'function') {
    // 첫 번째 인자가 함수인 경우, 리듀서 패턴으로 간주
    return { initialState: secondArg as T, isReduce: true };
  } else {
    // 첫 번째 인자가 객체인 경우, 초기 상태로 간주
    return { initialState: firstArg as T, isReduce: false };
  }
}
