import { Store } from '@ilokesto/store';
import { getStore } from '../../lib/getStore';
import type { ReduceFn } from '../../types/ReduceFn';
import type { UseReducer, UseState } from '../../types/UseStore';
import { createUseState } from '../createUseState';
import { getInitialState } from './getInitialState';

// useReducer
export function create<T, Action extends { type: string; [x: PropertyKey]: any }>(
  reduceFn: ReduceFn<T, Action>,
  initialState: T | Store<T>,
): UseReducer<T, Action>;

// useState
export function create<T>(initialState: T | Store<T>): UseState<T>;

// implementation
export function create<T, Action extends { type: string; [x: PropertyKey]: any }>(
  firstArg: Store<T> | T | ReduceFn<T, Action>,
  secondArg?: T,
) {
  const { initialState, isReduce } = getInitialState(firstArg, secondArg);
  const store = getStore(initialState, isReduce ? (firstArg as ReduceFn<T, Action>) : undefined);

  const useStore = Object.assign(
    <S>(selector: (state: T) => S = (state: T) => state as any) => {
      return createUseState(store, selector);
    },
    {
      writeOnly: () => store.setState.bind(store),
      readOnly: <S>(selector: (state: T) => S = (state: T) => state as any): S =>
        useStore(selector)[0],
    },
  );

  return useStore;
}
